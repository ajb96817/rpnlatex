

import {
  loadPyodide
} from 'pyodide';


async function load_pyodide_if_needed() {
  if(self.pyodide) return;
  // TODO: error handling
  self.pyodide = await loadPyodide({indexURL: '/public'});
  postMessage({message: 'loading'});
  await self.pyodide.loadPackage("sympy", {checkIntegrity: false});
  const initcode = `
      import time
      from sympy import *
      def log2(x): return log(x,2)
      def log10(x): return log(x,10)
      def divide(x,y): return sympify(x)/simpify(y)
      def subtract(x,y): return sympify(x)-sympify(y)
      def negate(x): return -S(x)`;
  await self.pyodide.runPythonAsync(initcode);
  postMessage({message: 'ready'});
}  

async function run_sympy_command(command_id, code) {
  const pyodide = self.pyodide;
  // TODO: post error message if pyodide not running
  const start_time = Date.now();
  postMessage({message: 'running'});
  let result = await pyodide.runPythonAsync(code);
  const elapsed_time = Date.now() - start_time;
  // Copy out of any PyProxy returned by the code.
  const result_js = result.toJs();
  result = {elapsed_time: elapsed_time, ...result_js};
  /* result: {
       result_expr: {srepr: ..., latex: ...},
       elapsed_time: 123.4,
       error: { ... }
     }
  */
  postMessage({
    message: 'command_finished',
    command_id: command_id,
    result: result
  });
}


onmessage = async (event) => {
  const data = event.data;
  const command = data.command;
  switch(command) {
  case 'sympy_command':
    await load_pyodide_if_needed();
    await run_sympy_command(data.command_id, data.code);
    break;
  default:
    break;
  }
};

