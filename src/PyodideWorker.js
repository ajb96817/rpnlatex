
// Simple background processor WebWorker for executing Python code
// with Pyodide.  A web worker is used instead of calling Pyodide directly
// mostly so that the user can interrupt long-running commands easily
// (by terminating and restarting the web worker).


import {
  loadPyodide
} from 'pyodide';


async function load_pyodide_if_needed() {
  if(self.pyodide) return;
  // TODO: error handling
  self.pyodide = await loadPyodide({indexURL: '/'});
  postMessage({message: 'loading'});
  await self.pyodide.loadPackage('sympy', {checkIntegrity: false});
  await self.pyodide.runPythonAsync(pyodide_initcode_string);
  postMessage({message: 'ready'});
}

async function pump_message_queue() {
  const queue = self.message_queue || [];
  while(queue.length > 0) {
    const message = queue.pop(0);
    await handle_message(message);
  }
}

function enqueue_message(message) {
  self.message_queue ||= [];
  self.message_queue.push(message);
}

async function handle_message(message) {
  if(message.command === 'sympy_command') {
    await load_pyodide_if_needed();
    await run_sympy_command(message.code);
  }
}

async function run_sympy_command(code) {
  const pyodide = self.pyodide;
  // TODO: post error message if pyodide not running
  const start_time = Date.now();
  postMessage({message: 'running'});
  let result = await pyodide.runPythonAsync(code);
  // Copy out of any PyProxy returned by the code.
  const result_js = result.toJs();
  const elapsed_time = Date.now() - start_time;
  result = {elapsed_time: elapsed_time, ...result_js};
  /* result: {
       result_expr: {srepr: ..., latex: ...},
       elapsed_time: 123.4,
       error: { ... }
     }
  */
  postMessage({
    message: 'command_finished',
    result: result
  });
}


onmessage = async (event) => {
  enqueue_message(event.data);
  pump_message_queue();
};


// "Helper" Python code for interfacing with Pyodide.
//
// We need to make sure SymPy itself is imported, and need a few extra
// convenience functions for Expr->SymPy conversions.
// Basically, we try to translate everything involved with building SymPy
// expressions into direct function calls (and literals like numbers), avoiding
// infix operators like x+y in favor of Add(x,y), and method calls like
// expr.subs(...) in favor of substitute(expr, ...) (defined here).
// Things like PrefixExpr('-', x) become negate(x), etc.
//
// It's kept here in an inline string instead of being a separate .py file
// for simplicity, so that we don't have to fetch it in a separate HTTP request
// or deal with building a "wheel" for it which is what Pyodide prefers.
const pyodide_initcode_string = `
from sympy import *

def log2(x): return log(x,2)
def log10(x): return log(x,10)
def divide(x,y): return S(x)/S(y)
def subtract(x,y): return S(x)-S(y)
def negate(x): return -S(x)
def substitute(expr,x,y): return expr.subs(x,y)
`;


// TODO: Not currently used/finished; this is a placeholder.
// This should be included into pyodide_initcode_string, but make sure it's
// not included as part of the generated code when exporting expressions
// via do_export_stack_item_as_sympy().
//
// This utility class attempts to convert SymPy result expressions back into
// rpnlatex Expr trees.  This could be done on the Javascript side instead,
// but because of Pyodide's object-proxy scheme it's better to do it directly
// in Python (otherwise we wind up creating a lot of proxies as the SymPy
// expression trees are traversed).
//
// The result of this "conversion" is a single string of Javascript code to
// be eval()'d, which creates the corresponding Expr tree.  This is the Python
// counterpart to the JS ExprToSymPy class.
const _pyodide_sympy_to_expr_code = `
class SymPyToExpr:
  pass
`;


export { pyodide_initcode_string };
