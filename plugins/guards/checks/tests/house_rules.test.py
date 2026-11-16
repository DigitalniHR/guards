"""Cases of house_rules.py (system#699): each rule fails on its case and passes on the fixed form."""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import house_rules  # noqa: E402

PROMPT = 'SYSTEM = "You are a Czech language quality checker. Return JSON with the fields ok and reason, nothing else."\n'


def found(path, source):
    return list(house_rules.findings(path, source))


class R4(unittest.TestCase):
    def test_prompt_in_script_fails(self):
        self.assertEqual(len(found("app/llm.py", PROMPT)), 1)

    def test_split_and_f_string_count_as_one(self):
        src = 'x = 1\nP = (f"You are the editor of {x}. Keep the facts, fix the grammar, "\n     "and never add a new claim to the text.")\n'
        self.assertEqual(len(found("app/llm.py", src)), 1)

    def test_docstring_short_text_and_test_fixture_pass(self):
        self.assertEqual(found("app/llm.py", '"""You are a module docstring that is long enough to pass the length limit of the check."""\n'), [])
        self.assertEqual(found("app/llm.py", 'S = "You are short."\n'), [])
        self.assertEqual(found("tests/test_llm.py", PROMPT), [])

    def test_php_json_decode_is_no_marker(self):
        src = 'PHP = "<?php function cfg() { return json_decode(file_get_contents($GLOBALS[1]), true); } // padding text"\n'
        self.assertEqual(found("tests_php.py", src), [])


class R6(unittest.TestCase):
    def test_silent_broad_except_fails(self):
        for body in ("pass", "continue", "return None", "..."):
            src = f"for i in []:\n    try:\n        i()\n    except Exception:\n        {body}\n"
            self.assertEqual(len(found("job.py", src)), 1, body)
        self.assertEqual(len(found("job.py", "try:\n    x()\nexcept:\n    pass\n")), 1)

    def test_reason_log_or_narrow_type_passes(self):
        self.assertEqual(found("job.py", "try:\n    x()\nexcept Exception:  # cleanup: the file may be gone\n    pass\n"), [])
        self.assertEqual(found("job.py", "try:\n    x()\nexcept Exception as e:\n    log.warning('X_FAILED %s', e)\n"), [])
        self.assertEqual(found("job.py", "try:\n    import y\nexcept ImportError:\n    pass\n"), [])


class Run(unittest.TestCase):
    def test_exit_code_and_skipped_folders(self):
        with tempfile.TemporaryDirectory() as d:
            bad, old = os.path.join(d, "bad.py"), os.path.join(d, "legacy", "old.py")
            os.makedirs(os.path.dirname(old))
            for p in (bad, old):
                with open(p, "w") as f:
                    f.write("try:\n    x()\nexcept Exception:\n    pass\n")
            script = os.path.join(os.path.dirname(HERE), "house_rules.py")
            r = subprocess.run([sys.executable, "-I", script, "bad.py", "legacy/old.py"], cwd=d, capture_output=True, text=True)
            self.assertEqual(r.returncode, 1)
            self.assertIn("bad.py:3: R6", r.stdout)
            self.assertNotIn("old.py", r.stdout)
            os.remove(bad)
            r = subprocess.run([sys.executable, "-I", script, "legacy/old.py"], cwd=d, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout)


if __name__ == "__main__":
    unittest.main()
