import sys
import re
import os

def accept_incoming(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # More robust regex for line endings and arbitrary whitespace
        pattern = re.compile(r'<<<<<<< HEAD\r?\n.*?\r?\n=======\r?\n(.*?)\r?\n>>>>>>> [a-fA-F0-9]+', re.DOTALL)
        
        new_content, num_subs = pattern.subn(r'\1', content)
        
        if num_subs > 0:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Successfully resolved {num_subs} conflicts in {filepath} by accepting INCOMING.")
        else:
            print(f"No conflicts found matching the pattern in {filepath}.")
            
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        accept_incoming(sys.argv[1])
