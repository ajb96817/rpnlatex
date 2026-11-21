
NOTE: Pyodide (currently) ships with a slightly outdated version of SymPy.  We want the latest v1.15.0.rc3.  The wheel for this version is simply included here but renamed to what Pyodide expects (sympy-1.14.0-py3-none-any.whl).  This works in practice.  The other two dependencies (mpmath and numpy) are stock from the Pyodide 314.0.8 distribution.

When updating Pyodide, be sure to manually copy its latest .whl files (for sympy, mpmath, numpy) into this directory.  Their names must match what is in the Pyodide distribution.
