#!/usr/bin/env python3
"""
Extract triple backtick code blocks from stdin and output their content.
By default extracts only the first code block. Streaming processing.
If no code blocks are found, outputs the original input as-is.

Usage:
  command_with_output | ./extract_code.py
  cat file.txt | ./extract_code.py
  git diff | ./ask.py "generate commit message" | ./extract_code.py
"""

import sys
import argparse


def extract_first_code_block():
    """Extract and output the first code block from stdin.
    If no code blocks are found, output the original input as-is."""
    STATE_NONE = 0      # Looking for opening backticks
    STATE_IN_CODE = 1   # Inside code block, outputting content
    STATE_DONE = 2      # Found closing backticks, done processing
    
    state = STATE_NONE
    original_lines = []  # Buffer for original input
    found_code_block = False
    
    for line in sys.stdin.readlines():
        line = line.rstrip('\n\r')
        # print(line, file=sys.stderr)
        
        if state == STATE_NONE:
            # Buffer original lines until we find a code block
            if not found_code_block:
                original_lines.append(line)
            
            # Looking for opening triple backticks
            if line.lstrip().startswith('```'):
                # Found opening backticks (skip this line)
                found_code_block = True
                original_lines = []  # Clear buffer since we'll output code only
                state = STATE_IN_CODE
                continue
        
        elif state == STATE_IN_CODE:
            # Check for closing backticks
            if line.lstrip().startswith('```'):
                # Found closing backticks
                state = STATE_DONE
                break  # Stop after first complete code block
            
            # Output code content
            print(line)
        
        elif state == STATE_DONE:
            break
    
    # If no code block was found, output original input
    if not found_code_block:
        for line in original_lines:
            print(line)


def extract_all_code_blocks():
    """Extract and output all code blocks from stdin.
    If no code blocks are found, output the original input as-is."""
    STATE_NONE = 0      # Looking for opening backticks
    STATE_IN_CODE = 1   # Inside code block, outputting content
    
    state = STATE_NONE
    original_lines = []  # Buffer for original input
    found_any_code_block = False
    
    for line in sys.stdin.readlines():
        line = line.rstrip('\n\r')
        # print(line, file=sys.stderr)
        
        if state == STATE_NONE:
            # Buffer original lines until we find first code block
            if not found_any_code_block:
                original_lines.append(line)
            
            # Looking for opening triple backticks
            if line.lstrip().startswith('```'):
                # Found opening backticks (skip this line)
                found_any_code_block = True
                original_lines = []  # Clear buffer since we'll output code only
                state = STATE_IN_CODE
                continue
        
        elif state == STATE_IN_CODE:
            # Check for closing backticks
            if line.lstrip().startswith('```'):
                # Found closing backticks, end of this code block
                state = STATE_NONE
                continue
            
            # Output code content
            print(line)
    
    # If no code blocks were found, output original input
    if not found_any_code_block:
        for line in original_lines:
            print(line)


def main():
    parser = argparse.ArgumentParser(
        description="Extract triple backtick code blocks from stdin. If no code blocks found, output original input.",
        epilog="Examples:\n  git diff | ./ask.py 'generate commit message' | ./extract_code.py"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Extract all code blocks (default: first only)"
    )
    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 1.0"
    )
    
    args = parser.parse_args()
    
    if args.all:
        extract_all_code_blocks()
    else:
        extract_first_code_block()


if __name__ == "__main__":
    main()
