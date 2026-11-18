"""The code rules of skill cleaning that a check before the merge holds, one copy for every repository (system#699).

R4 (prompt text lives in a .md file, never in a .py file; studio#154): a string literal of a tracked .py file fails when
it is long (MIN_CHARS or more; adjacent literals and the text parts of an f-string count as one) and reads like a model
instruction (MARKERS). Docstrings and test files are skipped: a test fixture is data. Fix: move the text to
prompts/<name>.md next to the script and read it at start.
R6 (no silent except; studio#155, dhr#822): a broad `except` (bare, `Exception`, `BaseException`) whose whole body is
`pass`, `continue`, `break`, `...` or a bare `return`/`return <constant>`, with no comment in the handler lines. Fix: log
the failed item with a code, or write the reason why nothing is lost as a # comment.

R2 (one way to call OpenRouter: through a client that writes the cost line; system#660): a file that names a paid
OpenRouter address (`openrouter.ai/api/...`, every path but the free key read `v1/key`) and names no cost line
(COST_NAMES) fails: its calls leave spend that the cost auditor cannot explain. A line with the comment `R2: <reason>`
is a read with no paid call. Fix: call the shared client of the unit, or write one cost line per paid answer.

Rule text: system skills/cleaning/done.md, "Code rules". Each repository runs this file in its tests from the public copy
DigitalniHR/guards.
Usage: python3 -I house_rules.py [file.py ...]   (no files: every tracked .py file of the git checkout of the working folder)
"""
import ast
import re
import subprocess
import sys

MIN_CHARS = 80
MARKER_WORDS = ("You are", "You convert", "Jsi ", r"Return (only )?JSON\b", "Vrať", "Odpovídej", "Output exactly",
                "Do not invent", "Do not use tools")  # short literals: this file passes its own check
MARKERS = re.compile(r"\b(" + "|".join(MARKER_WORDS) + ")", re.I)
SKIP_DIRS = {"archive", "legacy", "tmp", "vendor", "venv", ".venv", "node_modules"}
BROAD = {"Exception", "BaseException"}
PAID = re.compile(r"openrouter\.ai/api/(?!v1/key\b)")
COST_NAMES = re.compile(r"cost_line|model_cost|openrouter_client")


def skipped(path):
    return bool(SKIP_DIRS & set(path.split("/")[:-1]))


def test_file(path):
    name = path.rsplit("/", 1)[-1]
    return "tests" in path.split("/")[:-1] or name.startswith("test_") or name.endswith(("_test.py", ".test.py"))


def text_of(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        return "".join(v.value for v in node.values if isinstance(v, ast.Constant) and isinstance(v.value, str))
    return None


def prompts(tree):
    """R4: (line, head) of each long literal that reads like a model instruction."""
    skip = set()
    for n in ast.walk(tree):
        if isinstance(n, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n.body:
            first = n.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                skip.add(id(first.value))
        if isinstance(n, ast.JoinedStr):
            skip.update(id(v) for v in n.values)
    for n in ast.walk(tree):
        text = None if id(n) in skip else text_of(n)
        if text and len(text) >= MIN_CHARS and MARKERS.search(text):
            yield n.lineno, text[:60].replace("\n", " ")


def broad(handler):
    """A bare except, or one that catches Exception or BaseException (alone or in a tuple). A narrow type names the case."""
    t = handler.type
    if t is None:
        return True
    names = t.elts if isinstance(t, ast.Tuple) else [t]
    return any(isinstance(n, ast.Name) and n.id in BROAD or isinstance(n, ast.Attribute) and n.attr in BROAD for n in names)


def silent(handler):
    if not broad(handler) or len(handler.body) != 1:
        return False
    s = handler.body[0]
    if isinstance(s, (ast.Pass, ast.Continue, ast.Break)):
        return True
    if isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant) and s.value.value is Ellipsis:
        return True
    return isinstance(s, ast.Return) and (s.value is None or isinstance(s.value, ast.Constant))


def silent_excepts(tree, lines):
    """R6: the line of each silent broad except with no # comment in its lines."""
    for n in ast.walk(tree):
        if isinstance(n, ast.ExceptHandler) and silent(n):
            if not any("#" in line for line in lines[n.lineno - 1: n.body[-1].end_lineno]):
                yield n.lineno


def own_calls(source):
    """R2: the line of each paid OpenRouter address in a file that names no cost line."""
    if COST_NAMES.search(source):
        return
    for number, line in enumerate(source.split("\n"), 1):
        if PAID.search(line) and "R2:" not in line:
            yield number


def findings(path, source):
    tree = ast.parse(source, filename=path)
    if not test_file(path):
        for line, head in prompts(tree):
            yield f"{path}:{line}: R4 prompt text in a script: {head!r}"
        for line in own_calls(source):
            yield f"{path}:{line}: R2 own OpenRouter call with no cost line"
    for line in silent_excepts(tree, source.split("\n")):
        yield f"{path}:{line}: R6 silent except"


def main(paths):
    bad = []
    for path in paths:
        if skipped(path):
            continue
        try:
            source = open(path, encoding="utf-8").read()
            bad += findings(path, source)
        except (SyntaxError, UnicodeDecodeError, FileNotFoundError):
            continue  # not Python 3 source or not on disk: no rule to judge
    for line in bad:
        print(line)
    if bad:
        print(f"{len(bad)} finding(s). R2: call the shared OpenRouter client, or write one cost line per paid answer. R4: move the prompt to prompts/<name>.md and read it at start. R6: log the failed item "
              "with a code, or add a one-line reason as a # comment (cleaning, system skills/cleaning/done.md).")
    else:
        print(f"house rules R2, R4, R6: {len(paths)} file(s), 0 findings")
    return 1 if bad else 0


if __name__ == "__main__":
    files = sys.argv[1:] or subprocess.run(["git", "ls-files", "*.py"], capture_output=True, text=True, check=True).stdout.split()
    sys.exit(main(files))
