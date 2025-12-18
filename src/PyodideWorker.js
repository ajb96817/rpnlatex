

import {
  loadPyodide
} from 'pyodide';


let pyodide = null;

async function load_pyodide_if_needed() {
  if(pyodide) return;
  // TODO: error handling
  pyodide = await loadPyodide({indexURL: '/public'});
  console.log("finished loadPyodide");
  postMessage({message: 'pyodide_loading'});
  await pyodide.loadPackage("sympy", {checkIntegrity: false});
  console.log('loaded sympy');
  const code = `
      from sympy import *
      def log2(x): return log(x,2)
      def log10(x): return log(x,10)
      def divide(x,y): return sympify(x)/simpify(y)
      def subtract(x,y): return sympify(x)-sympify(y)
      def negate(x): return -S(x)`;
  await pyodide.runPythonAsync(code);
  console.log('ran init code');
  postMessage({message: 'pyodide_ready'});
}  


async function run_sympy_command(command_id, code) {
  // TODO: post error message if pyodide not running
  const start_time = Date.now();
  let result = await pyodide.runPythonAsync(code);
  const elapsed_time = Date.now() - start_time;
  // Copy the result structure just to make sure we don't
  // interfere with the Pyodide objects/proxies.
  const result_js = result.toJs();
  result = {elapsed_time: elapsed_time, ...result_js};
  // result: {
  //   result_expr: {srepr: ..., latex: ...},
  //   elapsed_time: 123.4,
  //   error: { ... }
  // }
  postMessage({
    message: 'command_finished',
    command_id: command_id,
    result: result
  });
}


onmessage = async (event) => {
  console.log('received message');
  console.log(event.data);
  const data = event.data;
  const command = data.command;
  switch(command) {
  case 'run_sympy_command':
    await load_pyodide_if_needed();
    await run_sympy_command(data.command_id, data.code);
    break;
  case 'shutdown':  // 'restart'?
    // ???
    break;
  default:
    break;
  }
};
