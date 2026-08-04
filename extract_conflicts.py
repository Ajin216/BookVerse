import os
import re

def extract_conflicts(directory):
    conflict_pattern = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [a-f0-9]+', re.DOTALL)
    for root, _, files in os.walk(directory):
        for file in files:
            filepath = os.path.join(root, file)
            if 'node_modules' in filepath or '.git' in filepath:
                continue
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    matches = conflict_pattern.findall(content)
                    if matches:
                        print(f"\n--- Conflicts in {filepath} ---")
                        for idx, match in enumerate(matches):
                            print(f"\nConflict {idx+1}:")
                            print("HEAD:\n" + match[0].strip())
                            print("-" * 20)
                            print("INCOMING:\n" + match[1].strip())
            except Exception as e:
                pass

if __name__ == '__main__':
    extract_conflicts('.')
