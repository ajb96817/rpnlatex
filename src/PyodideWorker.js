

import {
  loadPyodide
} from 'pyodide';


async function load_pyodide_if_needed() {
  if(self.pyodide) return;
  // TODO: error handling
  self.pyodide = await loadPyodide({indexURL: '/public'});
  postMessage({message: 'loading'});
  await self.pyodide.loadPackage('sympy', {checkIntegrity: false});
  const initcode = `
      from sympy import *
      def log2(x): return log(x,2)
      def log10(x): return log(x,10)
      def divide(x,y): return S(x)/S(y)
      def subtract(x,y): return S(x)-S(y)
      def negate(x): return -S(x)
      def substitute(expr,x,y): return expr.subs(x,y)`;
  await self.pyodide.runPythonAsync(initcode);
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
    await run_sympy_command(message.command_id, message.code);
  }
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
  enqueue_message(event.data);
  pump_message_queue();
};

