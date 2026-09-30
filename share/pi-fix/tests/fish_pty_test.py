"""Real fish-reader tests with a stub Pi; no provider calls or suggestion execution."""
import base64
import fcntl
import json
import os
import pty
import select
import shutil
import subprocess
import tempfile
import termios
import time
import unittest
from pathlib import Path

PLUGIN = Path(__file__).resolve().parents[3] / "pi-fix.fish"
NODE = shutil.which("node")


class FishReaderTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pi-fix-pty-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.capture = self.root / "capture.json"
        self.response = self.root / "response.json"
        self.response.write_text(json.dumps({"command": "printf '%s\\n' suggested", "message": ""}))
        stub = self.root / "pi"
        stub.write_text(
            f"#!{NODE}\n"
            "const fs = require('node:fs');\n"
            "let input = '';\n"
            "process.stdin.on('data', chunk => input += chunk);\n"
            "process.stdin.on('end', () => {\n"
            "  fs.writeFileSync(process.env.TEST_CAPTURE, input);\n"
            "  const response = fs.readFileSync(process.env.TEST_RESPONSE, 'utf8');\n"
            "  if (fs.existsSync(process.env.TEST_RESPONSE + '.wait')) {\n"
            "    setTimeout(() => process.stdout.write(response), 10000);\n"
            "  } else process.stdout.write(response);\n"
            "});\n"
        )
        stub.chmod(0o700)
        (self.root / "video.mkv").touch()
        master, slave = pty.openpty()
        self.master = master
        env = dict(os.environ, PATH=f"{self.root}:{os.environ['PATH']}",
                   TEST_CAPTURE=str(self.capture), TEST_RESPONSE=str(self.response), TERM="xterm-256color")
        init = (
            "function fish_prompt; printf 'TEST> '; end; "
            "function fish_right_prompt; end; fish_vi_key_bindings; "
            f"source '{PLUGIN}'; "
            "function dump_buffer; printf '\\nBUFFER:%s:END\\n' "
            "(commandline --current-buffer | base64 --wrap=0); end; "
            "bind -M insert \\ed dump_buffer; bind -M default \\ed dump_buffer"
        )
        def controlling_tty():
            os.setsid()
            fcntl.ioctl(0, termios.TIOCSCTTY, 0)

        self.process = subprocess.Popen(
            ["fish", "--no-config", "--features", "no-query-term", "-i", "-C", init], cwd=self.root, env=env,
            # This single-threaded fixture needs a controlling terminal for fish.
            stdin=slave, stdout=slave, stderr=slave, preexec_fn=controlling_tty,  # noqa: PLW1509
        )
        os.close(slave)
        self.addCleanup(self.stop_fish)
        self.read_until(b"TEST> ")

    def stop_fish(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        os.close(self.master)

    def send(self, text):
        os.write(self.master, text.encode())

    def read_until(self, marker, timeout=5):
        result = b""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            ready, _, _ = select.select([self.master], [], [], max(0, deadline - time.monotonic()))
            if ready:
                try:
                    result += os.read(self.master, 65536)
                except OSError as error:
                    self.fail(f"PTY closed: {error}; received {result!r}")
                if marker in result:
                    return result
        self.fail(f"Did not see {marker!r}; received {result!r}")

    def wait_for_capture(self):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if self.capture.exists():
                return json.loads(self.capture.read_text())
            select.select([], [], [], 0.02)
        self.fail("Pi did not receive context")

    def buffer(self):
        self.send("\x1bd")
        output = self.read_until(b":END")
        encoded = output.split(b"BUFFER:", 1)[1].split(b":END", 1)[0]
        return base64.b64decode(encoded).decode().rstrip("\n")

    def suggest(self):
        self.send("\x1bf")
        self.read_until(b"Alt-F: inspecting")
        context = self.wait_for_capture()
        # Alt-D is queued until the synchronous keybinding finishes.
        return context, self.buffer()

    def test_current_natural_language_is_text_and_suggestion_is_not_executed(self):
        marker = self.root / "must-not-execute"
        request = f"find files containing `keyword`; touch {marker}"
        self.send(request)
        context, buffer = self.suggest()
        self.assertEqual(context["source"], "buffer")
        self.assertEqual(context["request"], request)
        self.assertEqual(buffer, "printf '%s\\n' suggested")
        self.assertFalse(marker.exists())

    def test_empty_buffer_recovers_command_not_found_and_full_line(self):
        request = "concat these videos: ls *.mkv"
        self.send(request + "\r")
        self.read_until(b"TEST> ")
        context, buffer = self.suggest()
        self.assertEqual(context["source"], "previous")
        self.assertEqual(context["request"], request)
        self.assertEqual(context["previous_submission"]["exit_code"], 127)
        self.assertEqual(buffer, "printf '%s\\n' suggested")

    def test_previous_success_and_pipeline_status_are_preserved(self):
        self.send("false | true\r")
        self.read_until(b"TEST> ")
        context, _ = self.suggest()
        self.assertEqual(context["previous_submission"]["exit_code"], 0)
        self.assertEqual(context["previous_submission"]["pipeline_exit_codes"], [1, 0])

    def test_syntax_error_is_available_as_previous_submission(self):
        self.send("end\r")
        self.read_until(b"TEST> ")
        # Fish retains syntactically invalid input; clear it to test empty-line fallback.
        self.send("\x15")
        context, _ = self.suggest()
        self.assertEqual(context["source"], "previous")
        self.assertEqual(context["request"], "end")
        self.assertEqual(context["previous_submission"]["exit_code"], 123)

    def test_no_previous_command_does_not_start_pi(self):
        self.send("\x1bf")
        self.read_until(b"no previous command")
        self.assertFalse(self.capture.exists())
        self.assertEqual(self.buffer(), "")

    def test_clarification_preserves_input(self):
        self.response.write_text(json.dumps({"command": None, "message": "Which order?"}))
        self.send("concat videos")
        _, buffer = self.suggest()
        self.assertEqual(buffer, "concat videos")

    def test_vi_normal_mode_binding(self):
        self.send("find keyword\x1b")
        self.send("\x1bf")
        self.read_until(b"Alt-F: inspecting")
        self.wait_for_capture()
        self.assertEqual(self.buffer(), "printf '%s\\n' suggested")

    def test_cancel_preserves_input(self):
        Path(str(self.response) + ".wait").touch()
        self.send("find keyword\x1bf")
        self.read_until(b"Alt-F: inspecting")
        self.wait_for_capture()
        self.send("\x03")
        self.read_until(b"Alt-F: cancelled")
        self.assertEqual(self.buffer(), "find keyword")


if __name__ == "__main__":
    unittest.main()
