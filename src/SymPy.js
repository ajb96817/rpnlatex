
// Interface to SymPy via Pyodide.
// This mostly handles Expr->Python conversion.

import {
  Expr, CommandExpr, FontExpr, InfixExpr, PrefixExpr,
  PostfixExpr, FunctionCallExpr,
  TextExpr, SequenceExpr, DelimiterExpr,
  ArrayExpr, PlaceholderExpr, SubscriptSuperscriptExpr,
  SymPyExpr
} from './Exprs';


// Translations between internal command names and SymPy functions.
// [rpnlatex_command, sympy_function]
const sympy_function_translations = [
  ['sin^{-1}', 'asin'],
  ['cos^{-1}', 'acos'],
  ['tan^{-1}', 'atan'],
  ['sec^{-1}', 'asec'],
  ['csc^{-1}', 'acsc'],
  ['cot^{-1}', 'acot'],
  ['sinh^{-1}', 'asinh'],
  ['cosh^{-1}', 'acosh'],
  ['tanh^{-1}', 'atanh'],
  ['sech^{-1}', 'asech'],
  ['csch^{-1}', 'acsch'],
  ['coth^{-1}', 'acoth'],
  ['Tr', 'trace'],
  ['Re', 're'],
  ['Im', 'im'],
  ['ln', 'log'],
  ['log_2', 'log2'],
  ['lg', 'log2'],
  ['log_{10}', 'log10'],  // not yet implemented in the editor
  ['overline', 'conjugate'],
  ['bar', 'conjugate']
];

const allowed_unary_sympy_functions = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth',
  'asin', 'acos', 'atan', 'asec', 'acsc', 'acot',
  'asinh', 'acohs', 'atanh', 'asech', 'acsch', 'acoth',

  'det', 'trace', 're', 'im',
  'exp', 'log', 'log2', 'log10',
  'conjugate'
]);

// Maps between LaTeX commands and SymPy relation "classes".
const sympy_relation_types = [
  // Element 0: content of the corresponding TextExpr/CommandExpr
  //            (so any leading \ has been stripped)
  // Element 1: the full LaTeX string
  // Element 2: SymPy relation class name
  ['=',  '=',    'Equality'],
  ['<',  '<',    'StrictLessThan'],
  ['>',  '>',    'StrictGreaterThan'],
  ['ne', "\\ne", 'Unequality'],
  ['le', "\\le", 'LessThan'],
  ['ge', "\\ge", 'GreaterThan']
];

// LaTeX commands like \alpha that can be treated as variable names
// in SymPy by spelling out the command name.
const latex_letter_commands = new Set([
  'alpha', 'beta', 'chi', 'delta', 'epsilon', 'phi', 'gamma', 'eta',
  'iota', 'varphi', 'kappa', 'lambda', 'mu', 'nu', 'omega', 'pi',
  'vartheta', 'rho', 'sigma', 'tau', 'upsilon', 'theta', 'omega',
  'xi', 'psi', 'zeta', 'Delta', 'varepsilon', 'Phi', 'Gamma',
  'varkappa', 'Lambda', 'varpi', 'Omega', 'Pi', 'vartheta', 'varrho',
  'Sigma', 'varsigma', 'Upsilon', 'Theta', 'Omega', 'Xi', 'Psi',
  'digamma', 'mho', 'nabla', 'varDelta', 'varPhi', 'varGamma',
  'varLambda', 'varOmega', 'varPi', 'varTheta', 'varSigma',
  'varUpsilon', 'varXi', 'varPsi',
  'hbar', 'hslash'
]);


// 'to_sympy'=true converts from editor commands to SymPy
// (e.g. binom=>binomial); false is the inverse.
function translate_function_name(f, to_sympy) {
  const match = sympy_function_translations.find(
    pair => pair[to_sympy ? 0 : 1] === f);
  return match ? match[to_sympy ? 1 : 0] : f;
}

function is_valid_variable_name(s, allow_initial_digit) {
  const regex = allow_initial_digit ?
        /^[a-zA-Z0-9_]+$/g : /^[a-zA-Z][a-zA-Z0-9_]*$/g;
  return regex.test(s);
}

// If possible, convert an Expr to the corresponding SymPy
// variable name.  Greek letters and subscripted variables are
// allowed.  For example: x_0, f_alpha.  Bolded variables are
// handled as, e.g. 'x_0' => 'bold_x_0'.
//
// 'ignore_superscript'=true will ignore possible superscripts
// that are "in the way": x_1^y => 'x_1'.
//
// If the Expr does not convert to a valid variable name, null
// is returned.
function expr_to_variable_name(expr, ignore_superscript = false,
                               allow_subscript = true, allow_bold = true) {
  // Prepend 'bold_' if bolded.
  if(allow_bold && expr.is_font_expr() && expr.is_bold &&
     (expr.typeface === 'normal' || expr.typeface === 'roman')) {
    const unbolded_name = expr_to_variable_name(
      expr.expr, ignore_superscript, allow_subscript, false);
    return unbolded_name ? ('bold_' + unbolded_name) : null;
  }
  // Remove (ignore) roman font if present.
  // Other fonts like sans-serif are considered unconvertable.
  // TODO: fraktur('x') => 'frak_x' etc.
  if(expr.is_font_expr() && expr.typeface === 'roman')
    expr = expr.expr;
  // Check for expressions with a subscript.  Subscripted expressions
  // are converted to 'basename_subscriptname'.  Only one level of
  // subscripts is allowed (no x_a_b).
  if(allow_subscript &&
     expr.is_subscriptsuperscript_expr() &&
     expr.subscript_expr) {
    if(expr.superscript_expr && !ignore_superscript)
      return null;  // something like x^2_a
    const base_name = expr_to_variable_name(expr.base_expr, false, false, true);
    const subscript_name = expr_to_variable_name(expr.subscript_expr, false, false, true);
    if(base_name && subscript_name)
      return [base_name, subscript_name].join('_');
    else
      return null;
  }
  let variable_name = null;
  if(expr.is_text_expr() &&
     is_valid_variable_name(expr.text, !allow_subscript)) {
    // Basic variable name like 'x'.
    // The name has to be alphanumeric, and an initial digit is disallowed
    // unless it's in the subscript (x_0 is ok but not 0_x).
    variable_name = expr.text;
  }
  else if(expr.is_command_expr_with(0) &&
          latex_letter_commands.has(expr.command_name)) {
    // Unary CommandExpr for things like Greek letters.
    // These are spelled out as 'alpha', etc.
    variable_name = expr.command_name;
  }
  // Make sure the text or command doesn't have an actual '_' in it.
  if(variable_name && variable_name.includes('_'))
    return null;
  return variable_name;
}


// Inverse of expr_to_variable_name; returns null if the conversion
// is not possible.
// TODO: probably don't need this any more
function variable_name_to_expr(s) {
  return _variable_name_to_expr(s.split('_'), true);
}
function _variable_name_to_expr(pieces, allow_subscript) {
  let bold = false;
  let subscript_expr = null;
  let base_name = pieces.shift();
  if(base_name === 'bold') {
    // 'bold_something'
    bold = true;
    if(pieces.length === 0)
      return null;  // 'bold' by itself is disallowed
    base_name = pieces.shift();
  }
  if(pieces.length > 0 && allow_subscript) {
    // There is a subscript.  Everything normally allowed in variable
    // names also applies to subscripts, so recurse to handle it.
    // However, subscripts can't have their own subscripts.
    subscript_expr = _variable_name_to_expr(pieces, false);
    if(!subscript_expr)
      return null;
  }
  // There should be nothing left over at this point.
  if(pieces.length > 0)
    return null;
  let base_expr = null;
  if(latex_letter_commands.has(base_name))
    base_expr = new CommandExpr(base_name);  // Greek letter, etc.
  else if(base_name.length === 1)
    base_expr = new TextExpr(base_name);  // one-letter variable
  else  // longer-than-one variables are rendered in roman font
    base_expr = new FontExpr(new TextExpr(base_name), 'roman');
  if(bold)
    base_expr = base_expr.as_bold();
  // Attach the subscript if there is one.
  if(subscript_expr)
    base_expr = base_expr.with_subscript(subscript_expr);
  return base_expr;
}


// Manages the current Pyodide/SymPy execution state.
// This creates and communicates with a PyodideWorker background process
// and handles messages to and from it.
//
// Asynchronous changes to the Pyodide state can be tracked by setting
// the onStateChange callback in this interface.
//
// "Commands" to be sent to SymPy are packaged into a SymPyCommand object
// (containing the Python function name, the Expr arguments to it, etc.)
// and the last submitted/completed/errored command is kept in this.sympy_command.
//
// The 'state' field here can be:
//   - 'uninitialized': No Pyodide worker (web worker) created (yet).
//   - 'initializing': Pydodide worker is being instantiated and is loading Pyodide.
//   - 'loading': Pyodide worker is created, Pyodide itself has been "loaded"
//                (with loadPyodide()), now it is importing the sympy package
//                and doing any additional setup needed.
//   - 'ready': Loaded and initialized, but no command currently running;
//              this is the usual idle state.
//   - 'running': A command has been sent to the Pyodide worker and we're waiting
//                for a command_finished message to come in from it.
//   - 'long_running': Same as 'running', but we switch into this state from 'running'
//                     after a short time interval has passed without completion.
//                     This is used for the (typical) case where computations finish
//                     quickly, to reduce visual clutter/popping.
class PyodideInterface {
  constructor(app_component) {
    this.app_component = app_component;
    this.onStateChange = null;  // callback function
    this.worker = null;  // a PyodideWorker.js Worker instance, created lazily
    this.execution_started_at = null;  // timestamp
    this.sympy_command = null;  // SymPyCommand being executed, or that errored
    this.error_details = null;  // set to a details structure if there is an error to be shown
    this.change_state('uninitialized');
  }

  // TODO: fix this
  error(message) {
    throw new Error(message);
  }

  // Start the web worker.  Note that this doesn't actually start
  // initializing Pyodide or loading the SymPy libraries yet.
  // That happens on demand the first time a SymPy command message
  // is sent to the web worker.
  // TODO: Preload Pyodide/SymPy immediately on startup (and after
  // it gets terminated) based on a config option.
  start_pyodide_worker_if_needed() {
    if(!this.worker && window.Worker) {
      this.worker = new Worker(
        new URL("./PyodideWorker.js", import.meta.url),
        {type: 'module'});
      this.worker.onmessage = (event) => {
        this.handle_worker_message(event.data);
      };
    }
    return this.worker;
  }

  // Return true if terminated, false if nothing was done.
  terminate_pyodide_worker() {
    if(this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.execution_started_at = null;
      this.error_details = null;
      this.sympy_command = null;
      this.change_state('uninitialized');
      this.app_component.unlock_input();
      return true;
    }
    else return false;
  }

  post_worker_message(data) {
    if(this.worker)
      this.worker.postMessage(data);
  }

  handle_worker_message(data) {
    switch(data.message) {
    case 'initializing': this.change_state('initializing'); break;
    case 'init_error':
      // Something went wrong with Pyodide startup.
      // This happens if it can't load its Python packages, etc.
      this.error_details = {
        message: data.error_message,
        error_type: 'pyodide_init'
      };
      this.change_state('uninitialized');
      break;
    case 'loading': this.change_state('loading'); break;
    case 'ready': this.change_state('ready'); break;
    case 'running':
      this.execution_started_at = Date.now();
      // Show indicator only after enough time has passed because most
      // operations will probably complete quickly.  Note that the window.timeout
      // interval is set a little longer than this; this is to ensure that the
      // elapsed time has exceeded the threshold once the timeout has fired
      // (the timeout only gets fired once, so if it's too "early" it might not
      // see the long computation time).
      window.setTimeout(() => {
        this.check_for_long_running_commands();
      }, 10.0 + this.long_running_threshold_milliseconds());
      // Lock input until the computation finishes or we turn into the
      // 'long_running' state (or the Pyodide worker is terminated).
      this.app_component.lock_input();
      this.change_state('running');
      break;
    case 'command_finished':
      this.command_finished(data.result);
      break;
    default:
      break;
    }
  }

  change_state(new_state) {
    this.state = new_state;
    if(this.onStateChange)
      this.onStateChange(this, new_state);
  }

  long_running_threshold_milliseconds() { return 100.0; }
 
  check_for_long_running_commands() {
    if(this.state === 'running' &&
       Date.now() - this.execution_started_at >= this.long_running_threshold_milliseconds()) {
      this.app_component.unlock_input();
      this.change_state('long_running');
    }
  }

  // For use by external callers.
  expr_to_variable_name(expr) { return expr_to_variable_name(expr); }

  start_executing(sympy_command /* SymPyCommand */) {
    if(!this.start_pyodide_worker_if_needed())
      return this.error('Pyodide not available');
    this.sympy_command = sympy_command;
    this.execution_started_at = Date.now();
    this.error_details = null;
    let command_code = null;
    try {
      // Errors during the Expr->Python code conversion process
      // will be displayed in the SymPy error block, similar to
      // how errors from the actual Python execution are shown.
      command_code = this.generate_command_code(sympy_command);
    } catch(e) {
      if(e instanceof ExprToSymPyError) {
        this.error_details = {
          command: sympy_command,
          message: e.message,
          error_type: 'expr_conversion'
        };
        return;
      }
      else throw e;  // pass through "normal" JS errors
    }
    // NOTE: Pass along the Pyodide indexURL to use based
    // on the app's http location pathname.  Otherwise
    // the PyodideWorker doesn't know where to load its
    // resources from (it doesn't have access to the browser
    // location).
    this.post_worker_message({
      command: 'sympy_command',
      pyodide_index_path: window.location.pathname,
      code: command_code
    });
  }

  command_finished(result) {
    if(result.result === 'error') {
      this.error_details = {
        command: this.sympy_command,
        message: result.error_message,
        error_type: 'sympy_execution'
      };
    }
    else {
      const result_expr = new SymPyExpr(
        result.result_expr.srepr,
        result.result_expr.latex);
      this.app_component.push_sympy_result_expr(result_expr);
    }
    this.execution_started_at = null;
    this.app_component.unlock_input();
    this.sympy_command = null;
    this.change_state('ready');
  }

  clear() {
    this.execution_started_at = null;
    this.error_details = null;
    this.sympy_command = null;
  }

  // TODO: Revisit; this is a little awkward.
  // We want to clear the visible error message and reset the
  // sympy_command once the user types any key.  But if a command
  // is in-progress, we want to let it keep running.  So here we
  // only "reset" if there is an actual error being displayed.
  clear_if_errored() {
    if(this.error_details)
      this.clear();
  }

  generate_command_code(command) {
    const { function_name, operation_label,
            arg_exprs, extra_args,
            transform_result_code } = command;
    const insert_artificial_delay = false;  // TODO: make this a debug option
    // Generate builder functions, one per argument expression.
    const builder_function_name = index => 'build_expr_' + index.toString();
    const builder_function_codes = arg_exprs.map(
      (arg_expr, arg_index) => ExprToSymPy.expr_to_code(
        arg_expr, builder_function_name(arg_index)));
    // Generate a function to build all the argument expressions and
    // execute the requested command.
    let lines = [];
    lines.push('def execute_command():');
    if(insert_artificial_delay)
      lines.push('  import time', '  time.sleep(5)');
    lines.push(...arg_exprs.map((arg_expr, arg_index) =>
      ['  arg_', arg_index.toString(),
       ' = ', builder_function_name(arg_index), '()'
      ].join('')));
    const arguments_string = arg_exprs
          .map((arg_expr, arg_index) => 'arg_'+arg_index.toString())
          .concat(extra_args)
          .join(', ');
    lines.push([
      '  result = ', function_name,
      '(', arguments_string, ')'].join(''));
    if(transform_result_code)
      lines.push(['  result = ', transform_result_code].join(''))
    // Convert the result expression into srepr/latex format
    // and return a dict structure.
    lines.push(`
  return {
    'result': 'success',
    'result_expr': {
      'srepr': srepr(result),
      'latex': latex(result)
    } }
`);
    // Build an exception-handling wrapper around execute_command();
    // this will return an error-result structure if needed.
    lines.push(`
def execute_command_safe():
  try:
    return execute_command()
  except Exception as ex:
    return {
      'result': 'error',
      'error_message': str(ex)
    }
`);
    const execute_command_code = lines.join("\n")
    return [
      ...builder_function_codes,
      execute_command_code,
      'execute_command_safe()',
      ''
    ].join("\n");
  }
}


// Intermediate structure bundling function name and (Expr) arguments
// that will eventually be converted to Python code and sent to the Pyodide
// web worker.
//
// 'function_name': Python function to call (can include an explicit module name)
// 'operation_label': Optional user-visible label for the function name
//                    (e.g. we might want to display 'differentiate' instead of just 'diff')
// 'arg_exprs': Expr instances to be passed to the Python function
// 'extra_args': Plain strings to be passed as extra arguments to the Python function
//               (after the arg_exprs).  Used for things like 'optname=True' keyword arguments
//               and other non-Expr values.
// 'transform_result_code': An optional string to apply to the final result before it's
//                          returned back from Python (used for small conversions like turning
//                          a one-item list into a scalar, or extracting a relevant result from a tuple).
class SymPyCommand {
  constructor(function_name, operation_label,
              arg_exprs, extra_args, transform_result_code) {
    this.function_name = function_name;
    this.operation_label = operation_label;
    this.arg_exprs = arg_exprs;
    this.extra_args = extra_args;
    this.transform_result_code = transform_result_code;
  }
}


// Helper tree node classes for converting Exprs to SymPy expression
// builder functions.
class SymPyNode {
  constructor() {}
  is_variable_node() { return false; }
}

// Numbers, etc.
class SymPyConstant extends SymPyNode {
  constructor(value_string, raw = false) {
    super();
    this.value_string = value_string;
    this.raw = raw;
  }
  to_py_string(emitter) {
    if(this.raw)
      return this.value_string;
    else
      return ['S(', this.value_string, ')'].join('');
  }
}

// Symbol('x')
class SymPySymbol extends SymPyNode {
  constructor(name) {
    super();
    this.name = name;
  }
  to_py_string(emitter) {
    return ["Symbol('", this.name, "')"].join('');
  }
}

// Named subexpression: expr_1 = ...
class SymPySubexpression extends SymPyNode {
  constructor(expr_number) {
    super();
    this.expr_number = expr_number;
  }
  to_py_string(emitter) {
    return 'expr_' + this.expr_number.toString();
  }
}

// Function-call-and-assignment; becomes: expr_2 = Add(expr_1, 10)
// TODO: Merge this with SymPySubexpression, probably don't need both classes.
class SymPyAssignment extends SymPyNode {
  constructor(subexpression_node, value_node) {
    super();
    this.subexpression_node = subexpression_node;
    this.value_node = value_node;
  }
  to_py_string(emitter) {
    return [
      this.subexpression_node.to_py_string(emitter),
      this.value_node.to_py_string(emitter)
    ].join(' = ');
  }
}

// f(x,y,z) - Call a built-in SymPy function.
// Used for Python tuples too (x,y,z) (function_name='').
class SymPyFunctionCall extends SymPyNode {
  constructor(function_name, args) {
    super();
    this.function_name = function_name;
    this.args = args;
  }
  to_py_string(emitter) {
    const args_string = this.args
          .map(arg_node => arg_node.to_py_string(emitter))
          .join(', ');
    return [
      this.function_name, '(', args_string, ')'
    ].join('');
  }
}

// Function('f')(x,y,z) - Symbolic function call.
class SymPyFunctionObjectCall extends SymPyNode {
  constructor(name, args) {
    super();
    this.name = name;
    this.args = args;
  }
  to_py_string(emitter) {
    const args_string = this.args
          .map(arg_node => arg_node.to_py_string(emitter))
          .join(', ');
    return [
      "Function('", this.name, "')(", args_string, ')'
    ].join('');
  }
}

// Direct srepr() string of a SymPy expression.
class SymPySRepr extends SymPyNode {
  constructor(srepr_string) {
    super();
    this.srepr_string = srepr_string;
  }
  to_py_string(emitter) {
    return this.srepr_string;
  }
}

// Represents a "possibly-dependent variable".
// If there is a recorded independent variable associated with this
// variable name, output a "function call" with the independent
// variable as an argument.  This is used to convert e.g. y => y(x)
// for implicit derivative notation, so we can write things like
// y'' + y = 0 without writing out the y''(x).
// 
// If reverse_lookup=true is set, only the independent variable is
// output.  This is used for the variable argument to a diff() call.
// When using this mode, the caller must make sure the dependent/independent
// variable pair is actually registered using record_variable_dependency().
//
// TODO: Have a separate SymPyIndependentVariable for this case.
class SymPyVariable extends SymPyNode {
  constructor(name, reverse_lookup = false) {
    super();
    this.name = name;
    this.reverse_lookup = reverse_lookup;
  }
  is_variable_node() { return true; }
  to_py_string(emitter) {
    const [independent_var_name, is_ambiguous] =
          emitter.lookup_independent_variable_for(this.name);
    if(is_ambiguous)
      emitter.error('Ambiguous independent variable');
    if(this.reverse_lookup) {
      if(independent_var_name)
        return ["Symbol('", independent_var_name, "')"].join('')
      else  // shouldn't happen
        emitter.error('Independent variable not found');
    }
    else {
      // If we have a variable dependency recorded for this variable,
      // use it to make a function call, otherwise use the "plain"
      // variable symbol.
      if(independent_var_name) {
        // Function('f')(Symbol('x'))
        return [
          "Function('", this.name, "')(Symbol('", independent_var_name, "'))"
        ].join('');
      }
      else
        return ["Symbol('", this.name, "')"].join('')
    }
  }
}


class ExprToSymPyError extends Error {
  constructor(message, options) {
    super(message, options);
  }
}


// This handles the overall conversion of Expr trees to SymPy code.
// Nested expressions are converted into a list of Python assignment
// statements, generally one per Expr "node", SSA-style.
class ExprToSymPy {
  // Given an Expr tree, try to build a string of Python code
  // that will create the corresponding SymPy expression.
  // The generated code will be a Python function with the
  // supplied 'builder_function_name'.
  static expr_to_code(expr, builder_function_name) {
    return new this().expr_to_code(expr, builder_function_name);
  }
  
  constructor() {
    // 'variable_dependencies': Maps dependent_var_name => independent_var_properties.
    // When we see f(x) calls in the Expr tree the implied dependency is recorded here.
    // These are then used during code generation to replace 'plain' references to
    // 'f' with 'f(x)' when it makes sense.  This is mostly used for differential equations
    // where we might have something like y'' = -2y.  The y'' gets automatically converted
    // to y''(x) because of the "prime" notation assuming the variable 'x'.  We can then
    // use this information to change 'y' => 'y(x)'.  Normally that wouldn't happen because
    // 'y' is just a symbol.  Also, we might have: y'' = 2y(t).  In that case the user has
    // specified y(t) explicitly so that allows us to convert y'' => y''(t).
    // Note that the variable names here are plain strings as created by expr_to_variable_name().
    this.variable_dependencies = {};
    // Contains SymPyAssignment nodes for building expressions piece-by-piece.
    this.assignment_list = [];
    // Serial number for expr_1,2,3 in generated code.
    // TODO: This numbers the SymPySubexpressions, but this could be merged into the
    // SymPyAssignments instead of being separate.
    this.subexpression_count = 0;
  }

  // TODO: fix this (highlight offending_expr; also it should be offending_expr_path)
  error(message, offending_expr = null) {
    throw new ExprToSymPyError(message);
  }

  // NOTE: expr can be null here; will be converted to None.
  expr_to_code(expr, builder_function_name) {
    const return_node = expr ? this.emit_expr(expr) : this.raw('None');
    return this.generate_code(builder_function_name, return_node);
  }

  generate_code(builder_function_name, return_node) {
    let lines = [];
    lines.push(['def ', builder_function_name, '():'].join(''));
    for(const assignment of this.assignment_list)
      lines.push(['  ', assignment.to_py_string(this)].join(''));
    lines.push(['  return ', return_node.to_py_string(this)].join(''));
    lines.push('');
    return lines.join("\n");
  }

  symbol(variable_name) {
    return new SymPySymbol(variable_name);
  }

  // Like symbol(), but allows variable dependencies to be made explicit
  // during code generation; see SymPyVariable.
  variable(variable_name, reverse_lookup = false) {
    return new SymPyVariable(variable_name, reverse_lookup);
  }

  number(value) {
    return new SymPyConstant(value.toString());
  }

  // TODO: Should do proper string escaping, but this is only used in
  // some special cases to pass constant strings like '+'.
  string(value) {
    return this.raw(["'", value, "'"].join(''));
  }

  // This will be emitted as-is to Python.
  raw(string) {
    return new SymPyConstant(string, true);
  }

  // Construct (sub)expression from an existing SymPy srepr string.
  srepr(srepr_string) {
    return this.add_assignment(new SymPySRepr(srepr_string));
  }

  // Call a SymPy function.
  fncall(function_name /* string */, args = []) {
    return this.add_assignment(
      new SymPyFunctionCall(function_name, args));
  }

  // Function('f')(...args): SymPy Function object applied to arguments.
  // This is used to translate "generic" FunctionCallExprs like f(x).
  // Calls to built-in SymPy functions use .fncall() instead.
  // NOTE: FunctionCallExpr allows arbitrary expressions in the function-name
  // position, but SymPy requires the function name to be a plain string
  // (same as with Symbol).
  function_object_call(function_name, args = []) {
    return this.add_assignment(
      new SymPyFunctionObjectCall(function_name, args));
  }

  // Python (x,y,z) tuple - treated as a function call with empty function name.
  tuple(args = []) {
    return this.fncall(
      '', args.length === 1
        ? [...args, this.raw('')]  // special case (x,) Python syntax
        : args);
  }

  // Record a functional dependency like f(x) found while analyzing the
  // expression.  See the constructor() comment for more details.
  //
  // 'dependency_type' can be:
  //   - 'assumed': Independent variable came from an assumption based
  //                on the notation, e.g.: y' => y'(x) and \dot{x} => \dot{x}(t)
  //   - 'explicit': Expression contained an explicit f(x), or f'(x) or similar.
  //
  // Explicit dependencies override assumed ones.  However, if there are two
  // conflicting explicit dependencies in the same expression, like y(x) and y(t),
  // the dependency is marked as ambiguous and not used for code generation
  // (a lone 'y' will just be left as 'y').
  record_variable_dependency(dependent_var_name, independent_var_name, dependency_type) {
    const props = this.variable_dependencies[dependent_var_name] ?? {
      independent_var_name: independent_var_name,
      dependency_type: null  // one of ['assumed', 'explicit', 'ambiguous', null]
      // NOTE: once dependency_type is ambiguous, it's stuck like that for the whole expression
    };
    const old_type = props.dependency_type;
    const var_names_match = props.independent_var_name === independent_var_name;
    let new_type = null, new_independent_var_name = null;
    if(dependency_type === 'explicit') {
      if(old_type === 'explicit' && !var_names_match)
        new_type = 'ambiguous';  // conflicting explicit dependency: y(t) vs. y(x)
      else if(old_type === 'assumed' || old_type === null) {
        // Explicit always overrides assumed (or absent), as in: y' + y(z) (y' assumed as y'(x))
        new_independent_var_name = independent_var_name;
        new_type = 'explicit';
      }
    }
    else if(dependency_type === 'assumed') {
      // Take care of any potential corner cases, like conflict between
      // y' and \dot{y} notation assuming different things.  Shouldn't happen
      // as things currently are though.
      if(old_type === 'assumed' && !var_names_match)
        new_type = 'ambiguous';
      else if(old_type === null) {
        // Nothing has been seen yet, so use the assumption.
        new_type = 'assumed';
        new_independent_var_name = independent_var_name;
      }
    }
    if(new_type) props.dependency_type = new_type;
    if(new_independent_var_name) props.independent_var_name = new_independent_var_name;
    this.variable_dependencies[dependent_var_name] = props;
    return props;  // return value not used
  }

  // Look up independent variable associated with this name recorded.
  // Returns [independent_var_name, is_ambiguous].
  // independent_var_name will be null if it hasn't been recorded.
  // The ambiguous flag gets set if we have e.g. f(x) and f(y) in
  // the same expression.
  lookup_independent_variable_for(dependent_var_name) {
    const props = this.variable_dependencies[dependent_var_name];
    if(props)
      return [
        props.independent_var_name, 
        props.dependency_type === 'ambiguous'];
    else
      return [null, false];
  }

  add_assignment(value_node) {
    const subexpr_node = new SymPySubexpression(++this.subexpression_count);
    this.assignment_list.push(
      new SymPyAssignment(subexpr_node, value_node));
    return subexpr_node;
  }

  emit_expr(expr) {
    switch(expr.expr_type()) {
    case 'text': return this.emit_text_expr(expr);
    case 'font': return this.emit_font_expr(expr);
    case 'infix': return this.emit_infix_expr(expr);
    case 'prefix': return this.emit_prefix_expr(expr);
    case 'postfix': return this.emit_postfix_expr(expr);
    case 'function_call': return this.emit_function_call_expr(expr);
    case 'delimiter': return this.emit_delimiter_expr(expr);
    case 'command': return this.emit_command_expr(expr);
    case 'subscriptsuperscript': return this.emit_subscriptsuperscript_expr(expr);
    case 'sequence': return this.emit_sequence_expr(expr);
    case 'array': return this.emit_array_expr(expr);
    case 'placeholder': return this.error('Placeholders not allowed', expr);
    case 'tensor': return this.error('Tensors not allowed', expr);
    case 'sympy': return this.emit_sympy_expr(expr);
    default: return this.error('Unknown expr type: ' + expr.expr_type(), expr);
    }
  }

  emit_exprs(exprs) {
    return exprs.map(expr => this.emit_expr(expr));
  }

  emit_text_expr(expr) {
    if(expr.looks_like_number())
      return this.number(expr.text);
    const variable_name = expr_to_variable_name(expr);
    if(variable_name) {
      // Special case for 'i' (imaginary unit).
      if(variable_name === 'i')
        return this.number('I');
      else
        return this.variable(variable_name);
    }
    else
      return this.error('Invalid variable name', expr);
  }

  emit_font_expr(expr) {
    // If this is a valid bolded variable name, use that, otherwise
    // ignore the font and convert the base expression.
    const variable_name = expr_to_variable_name(expr);
    if(variable_name)
      return this.variable(variable_name);
    else 
      return this.emit_expr(expr.expr);
  }

  // InfixExprs are flat lists of operators and operands, so we have
  // to "parse" the terms and take into account operator precedence.
  // (x+y*z => x+(y*z)).
  emit_infix_expr(expr) {
    const result = this.try_analyzers(analyzer_table.infix, [expr]);
    if(result)
      return result;
    else this.error('Invalid infix expression');
  }

  // Only '+' and '-' prefix operators are supported (and + is disregarded).
  // TODO: PrefixAnalyzer
  emit_prefix_expr(prefix_expr) {
    switch(prefix_expr.operator_text()) {
    case '-': return this.fncall('negate', [this.emit_expr(prefix_expr.base_expr)]);
    case '+': return this.emit_expr(prefix_expr.base_expr);
    default: return this.error('Invalid prefix operator', prefix_expr);
    }
  }
      
  // Single and double factorials are supported.
  // TODO: PostfixAnalyzer
  emit_postfix_expr(postfix_expr) {
    const [base_expr, factorial_signs_count] = postfix_expr.analyze_factorial();
    if(factorial_signs_count === 1)
      return this.fncall('factorial', [this.emit_expr(base_expr)]);
    else if(factorial_signs_count === 2)
      return this.fncall('factorial2', [this.emit_expr(base_expr)]);
    else if(factorial_signs_count > 1)
      return this.error('Multiple factorial >2 not supported', postfix_expr);
    else
      return this.error('Invalid postfix operator', postfix_expr);
  }

  emit_function_call_expr(expr) {
    const result = this.try_analyzers(analyzer_table.function_call, [expr]);
    if(result)
      return result;
    else this.error('Invalid function call');
  }

  // Other than the basic grouping delimiters, some particular delimiter types
  // can be converted to SymPy operations (like floor/ceil).  Other delimiters,
  // like <x|, will signal an error.
  // TODO: DelimiterAnalyzer
  emit_delimiter_expr(expr) {
    const [left, right] = [expr.left_type, expr.right_type];
    const inner_node = this.emit_expr(expr.inner_expr);
    if((left === '.' && right === '.') ||
       (left === '(' && right === ')') ||
       (left === '[' && right === ']') ||
       (left === "\\{" && right === "\\}"))
      return inner_node;
    else if(left === "\\lceil" && right === "\\rceil")
      return this.fncall('ceiling', [inner_node]);
    else if(left === "\\lfloor" && right === "\\rfloor")
      return this.fncall('floor', [inner_node]);
    else if((left === "\\lVert" && right === "\\rVert") ||
            (left === "\\vert" && right === "\\vert"))
      return this.fncall('abs', [inner_node]);
    else
      return this.error('Unsupported delimiters', expr);
  }

  emit_command_expr(expr) {
    const result = this.try_analyzers(analyzer_table.command, [expr]);
    if(result)
      return result;
    else return this.error('Cannot use command here');
  }

  emit_subscriptsuperscript_expr(expr) {
    const result = this.try_analyzers(
      analyzer_table.subscriptsuperscript, [expr]);
    if(result)
      return result;
    else this.error('Invalid subscripted expression');
  }

  // SymPyExpr already has the 'srepr' direct representation available; use that.
  emit_sympy_expr(expr) {
    return this.srepr(expr.srepr_string);
  }

  // A SequenceExpr is broken up into one or more 'terms' to be implicitly
  // multiplied together.  Each term can be a single simple Expr like x^2,
  // or a possibly longer subsequence of Exprs that represents something like
  // an integral.  What is not allowed are "non-term-like" Exprs, for example
  // InfixExprs like 'x+y'.  If they are wrapped in delimiters as in '(x+y)'
  // then that is still valid, and the term is the single DelimiterExpr.
  // Normally, the delimiters are created automatically when needed so most
  // typical sequences of concatenated Exprs can be interpreted this way.
  emit_sequence_expr(sequence_expr) {
    // List of "converted" terms to be implicitly multiplied together with Mul(...).
    // If we wind up with only a single term, the Mul() is omitted.
    // TODO: check zero-term case
    let term_nodes = [];
    const exprs = sequence_expr.exprs;
    let start_index = 0, stop_index = exprs.length;
    while(start_index < stop_index) {
      for(const analyzer_class of analyzer_table.sequence) {
        const analyzer_result = new analyzer_class(this)
              .analyze(exprs, start_index, stop_index);
        if(analyzer_result === null)
          continue;  // no match, try next analyzer
        if(analyzer_result.success) {
          term_nodes.push(analyzer_result.result_node);
          start_index = analyzer_result.stopped_at_index;
          break;
        }
        else return this.error(
          analyzer_result.error_message, /* errored_expr... */);
      }
    }
    if(term_nodes.length === 1)
      return term_nodes[0];
    else
      return this.fncall('Mul', term_nodes);
  }

  try_analyzers(analyzer_classes, exprs) {
    for(const analyzer_class of analyzer_classes) {
      const analyzer_result = new analyzer_class(this).
            analyze(exprs, 0, 1);
      if(analyzer_result) {
        if(analyzer_result.success)
          return analyzer_result.result_node;
        else return this.error(
          analyzer_result.error_message, /* errored_expr... */);
      }
    }
    return null;
  }
}


// Abstract superclass for Expr pattern-matching rules (analyzers).
// These operate on lists of Exprs (usually taken from a SequenceExpr)
// and work in conjunction with ExprToSymPy to convert matching
// Expr subsequences to a corresponding SymPyNode tree that represents
// the Python code to be generated.
//
// Generally, non-Sequence expressions have their own, simpler rules
// for handling things like SubscriptSuperscriptExpr -> powers.  But
// for SequenceExpr, we may have several different kinds of multi-Expr
// notations for various types of mathematical notation.
// SequenceExprs are converted to SymPy by scanning them left-to-right,
// trying a series of these Analyzers until one matches.  A matching
// rule will convert its match into a SymPyNode and also report on the
// extent (number of Exprs) consumed for the match.
class Analyzer {
  constructor(emitter) {
    this.emitter = emitter;
  }

  // Subclasses override this to "analyze" a range of expressions
  // within a SequenceExpr.
  // The return value must be one of:
  //   - No rule match found: null
  //   - On success: {success: true, result_node: ..., stopped_at_index: ...}
  //   - On failure: {success: false, error_message: '...', errored_expr_index: 3}
  analyze(exprs, start_index, stop_index) {
    return null;
  }

  success(result_node, stopped_at_index) {
    return {
      success: true,
      result_node: result_node,
      stopped_at_index: stopped_at_index
    };
  }

  no_match() { return null; }

  failure(error_message, errored_expr_index = null) {
    return {
      success: false,
      error_message: error_message,
      errored_expr_index: errored_expr_index
    };
  }

  // Raise an exception, for malformed patterns that need to be reported
  // to the user rather than just being ignored as a failed match.
  error(error_message) {
    // TODO: errored_expr_index
    return this.emitter.error(error_message);
  }

  // Scan for one or more consecutive "term" expressions within 'exprs'
  // starting at start_index.  This is something like [x, sin(x)] that
  // can be used as an argument to things like summation or differentiation
  // expressions.
  // The SymPyNode representing the product of the consecutive terms is
  // returned (null if there is no valid term at start_index), along with
  // the updated index pointing directly after the last scanned term.
  scan_implicit_product(exprs, start_index, stop_index) {
    let index = start_index, term_exprs = [];
    while(index < stop_index &&
          exprs[index].is_term_expr(index === start_index))
      term_exprs.push(exprs[index++]);
    const result_node =
          term_exprs.length === 0 ? null :
          this.multiply_all_exprs(term_exprs);
    return [result_node, index];
  }

  // Emit and multiply together all 'exprs', returning a SymPyNode.
  // 'exprs' must be nonempty.
  multiply_all_exprs(exprs) {
    const nodes = exprs.map(expr => this.emitter.emit_expr(expr));
    return nodes.length === 1 ?
      nodes[0] :
      this.emitter.fncall('Mul', nodes);
  }
}


// Multiply adjacent "term" expressions together.
// This is the default if no other rule matches in a SequenceExpr.
class ImplicitProductAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    const [product_node, new_index] =
          this.scan_implicit_product(exprs, start_index, stop_index);
    if(product_node)
      return this.success(product_node, new_index);
    else
      return this.failure(
        'Term not allowed in an implicit product',
        start_index);
  }
}


// Handles:
//   - "where" notation: f(x)_{x=3}
//   - x^T, x^\dagger, other "transpose-like" operators
//   - e^x: exp(x)
//   - (x+1)^2: ordinary powers
class SubscriptSuperscriptAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    const expr = exprs[start_index];
    const index = start_index+1;
    if(!expr.is_subscriptsuperscript_expr())
      return this.no_match();  // shouldn't happen
    let {base_expr, subscript_expr, superscript_expr} = expr;
    // First check things that might depend on the subscript.
    let node =
      this.analyze_where(base_expr, subscript_expr, superscript_expr) ||
      this.analyze_exp(base_expr, subscript_expr, superscript_expr);
    if(node)
      return this.success(node, index);
    // At this point, any subscript must be something like 'f_a': a simple
    // variable name with simple subscript that translates into a valid SymPy
    // symbol.  Other notations involving subscripts have already been handled
    // (e.g. 'where' syntax) or are handled by other analyzers (such as the
    // lower limit of sums or integrals).
    let base_expr_node = null;
    if(subscript_expr) {
      const variable_name = expr_to_variable_name(
        expr, true /* ignore_superscript */);
      if(variable_name)
        base_expr_node = this.emitter.variable(variable_name);
      else
        return this.failure('Invalid subscripted expression', start_index);
    }
    else  // something like (x+1)^2  (superscript but no subscript)
      base_expr_node = this.emitter.emit_expr(base_expr);
    // Now we are working with 'base_expr_node' and 'superscript_expr' only.
    node =
      this.analyze_transposelike(base_expr_node, superscript_expr) ||
      this.analyze_power(base_expr_node, superscript_expr) ||
      base_expr_node;  // "plain" variable like x_n
    return this.success(node, index);
  }

  // Check for for "where" expressions of the form: f|_{x=y}.
  // TODO: allow superscript for upper-minus-lower intervals.
  analyze_where(base_expr, subscript_expr, superscript_expr) {
    if(base_expr.is_delimiter_expr() &&
       base_expr.left_type === '.' && base_expr.right_type === "\\vert" &&
       subscript_expr && subscript_expr.is_infix_expr() &&
       subscript_expr.operator_text_at(0) === '=') {
      if(superscript_expr)  // TODO
        return this.error('Cannot use superscript here', expr);
      const lhs = subscript_expr.operand_exprs[0];
      const rhs = subscript_expr.extract_side_at(0, 'right');
      return this.emitter.fncall('substitute', [
        this.emitter.emit_expr(base_expr.inner_expr),
        this.emitter.emit_expr(lhs),
        this.emitter.emit_expr(rhs)]);
    }
    else
      return null;
  }

  // e^x (both roman and normal 'e').
  analyze_exp(base_expr, subscript_expr, superscript_expr) {
    if(superscript_expr &&
       !subscript_expr && // can't have a subscripted 'e'
       (base_expr.is_text_expr_with('e') ||
        (base_expr.is_font_expr() && base_expr.typeface === 'roman' &&
         base_expr.expr.is_text_expr_with('e'))))
      return this.emitter.fncall('exp', [
        this.emitter.emit_expr(superscript_expr)]);
    else
      return null;
  }

  // x^T: transpose
  // x^{*}: conjugate
  // x^\dagger: conjugate transpose (hermitian conjugate)
  // x^\circ: degrees notation
  analyze_transposelike(base_expr_node, superscript_expr) {
    if(!superscript_expr)
      return null;
    // Check for normal or roman 'T' for transpose.
    if(superscript_expr.is_text_expr_with('T') ||
       (superscript_expr.is_font_expr() && superscript_expr.typeface === 'roman' &&
        superscript_expr.expr.is_text_expr_with('T')))
      return this.emitter.fncall('transpose', [base_expr_node]);
    if(superscript_expr.is_text_expr_with('*'))
      return this.emitter.fncall('conjugate', [base_expr_node]);
    if(superscript_expr.is_command_expr_with(0, 'dagger'))
      return this.emitter.fncall('conjugate', [
        this.emitter.fncall('transpose', [base_expr_node])]);
    if(superscript_expr.is_command_expr_with(0, 'circ'))
      return this.emitter.fncall('Mul', [
        base_expr_node,
        this.emitter.fncall('divide', [
          this.emitter.symbol('pi'),
          this.emitter.number(180)])]);
    return null;    
  }

  // "Default" (x+1)^2 type expression.
  analyze_power(base_expr_node, superscript_expr) {
    if(superscript_expr)
      return this.emitter.fncall('Pow', [
        base_expr_node,
        this.emitter.emit_expr(superscript_expr)]);
    else
      return null;
  }
}


// Recognize the following forms within a SequenceExpr:
//   \int x^2 dx
//   \int dx x^2
//   \int \frac{... dx}{...} - see below
//   \int \frac{dx ...}{...}
//   \int\int (x+y)^2 dx dy - inner integral evaluated first
//   \int x^2 dx \int y^2 - product of two separate integrals;
//      this is handled as ordinary implicit multiplication and
//      not treated specially here
//   \int\int (x+y)^2 dx \wedge dy - the dx^dy differential form
//      is treated as 'dx dy' (not exactly correct mathematically
//      but it's the best we can do without actual exterior calculus
//      support in SymPy)
// Notes:
//   - Whitespace around the integrand is disregarded;
//     \int x^2 \, dx is a typical case.
//   - \iint and \iiint are treated as synonyms for multiple \int
//   - \int signs may have limits or not; if not, it's treated as an
//     indefinite integration.
//   - The integrand must be either:
//     - one or more Exprs that can be combined with implicit multiplication
//       (using the is_term_expr() logic); or
//     - an infix expression where all the operators are \cdot
//       (e.g. \iint x\cdot y dx dy).
//     Therefore, \iint x+y dx dy isn't allowed but \iint (x+y) dx dy is OK.
//   - The differential must be either directly adjacent to the integral
//     sign(s) or else directly after the integrand.
//   - A \frac integrand is scanned for differential(s) in its numerator
//     (in the first or last positions), but "inline" fractions are not
//     recognized: \int dx/x (this could be added)
//   - Forms like \iint\frac{dx dy}{x+y} are allowed.
//   - Cyclic integrals (\oint etc) are not recognized, but this could
//     be added (just as synonyms for \int).
class IntegralAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    let index = start_index;
    // Count the number of integral signs at the start and record
    // the integral limits.
    // This will be a list of {lower: expr1, upper: expr2}.
    // One or both exprs may be null if limits are not specified.
    // Multiple integral signs like \iint get multiple duplicate
    // entries in this list (this isn't very useful for definite
    // integrals though).
    const integral_limit_exprs = [];
    while(index < stop_index) {
      const integral_info = this.analyze_integral_sign(exprs[index]);
      if(!integral_info) {
        if(index === start_index) {
          // No initial integral sign, so the integral check
          // "fails" (not considered an error, it just falls through
          // to the next analyzer).
          return null;
        }
        else break;  // found all the integral signs
      }
      const {
        integral_count, lower_limit, upper_limit
      } = integral_info;
      // It's considered an error if we have an upper limit without
      // a lower, or vice versa.
      if(!upper_limit !== !lower_limit)
        return this.failure(
          'Definite integrals need both limits specified',
          index);
      for(let j = 0; j < integral_info.integral_count; j++)
        integral_limit_exprs.push(
          {lower: lower_limit, upper: upper_limit});
      index++;
    }
    const {
      success, dx_exprs, integrand_terms, stopped_at_index, error_message
    } = this.extract_integrand_and_differentials(
      exprs, index, stop_index, integral_limit_exprs.length);
    if(success) {
      if(integrand_terms.length === 0) {
        // Implicit '1' integrand, as in '\int dx'.
        integrand_terms.push(TextExpr.integer(1));
      }
      // NOTE: For iterated integrals, the SymPy integrate calls are built
      // from the "inside out":
      //   \iint xy dx dy  =>  integrate(integrate(x*y, x), y)
      const integrate_command_node =
            this.build_integrate_command(
              this.multiply_all_exprs(integrand_terms),
              integral_limit_exprs, dx_exprs);
      return this.success(integrate_command_node, stopped_at_index);
    }
    else {
      // TODO: check/revisit
      // TODO: errored_expr_index
      return this.error(error_message);
    }
  }

  // NOTE: integral_limit_exprs and dx_exprs must be the same length.
  build_integrate_command(integrand_node, integral_limit_exprs, dx_exprs) {
    if(dx_exprs.length > 1) {
      // Recurse to construct the inner integral(s) first.
      integrand_node = this.build_integrate_command(
        integrand_node, integral_limit_exprs.slice(1), dx_exprs.slice(0, -1));
    }
    const inner_integral_limit_exprs = integral_limit_exprs[0];
    const inner_dx_expr = dx_exprs.at(-1);
    // Construct 2nd argument to integrate();
    // indefinite integrals use 'x', definite use '(x, a, b)' tuple.
    let dx_node = this.emitter.emit_expr(inner_dx_expr);
    const {lower, upper} = inner_integral_limit_exprs;
    if(lower && upper)
      dx_node = this.emitter.tuple([
        dx_node,
        this.emitter.emit_expr(lower),
        this.emitter.emit_expr(upper)]);
    return this.emitter.fncall('integrate', [integrand_node, dx_node]);
  }

  // Pull out any differentials from the numerator of a \frac.
  // Return the (possibly) rewritten \frac along with a list of
  // expressions for the differentials (e.g. dx dy -> [x, y]).
  // The "rules" for what terms are allowed in the numerator
  // are less strict than those for normal integrands: we simply
  // filter out any top-level differential forms from the numerator.
  //   \frac{x dx}{x+1} -> \frac{x}{x+1}, [x]
  //   \frac{dx}{x} -> \frac{1}{x}, [x]
  //   \frac{dx dy}{x+y} -> \frac{1}{x+y}, [x, y]
  extract_differentials_from_fraction(frac_expr) {
    const [numer_expr, denom_expr] = frac_expr.operand_exprs;
    let all_dx_exprs = [];
    // Check the numerator as a whole to see if it's a differential
    // on its own, like SequenceExpr['d', 'x'].
    let new_numer_exprs = [];
    const dx_exprs = this.analyze_differential_form(numer_expr);
    if(dx_exprs.length > 0)
      all_dx_exprs.push(...dx_exprs);
    else for(const expr of numer_expr.is_sequence_expr() ?
                   numer_expr.exprs : [numer_expr]) {
      // Check individual top-level pieces of the numerator and
      // build the (possible) new numerator.
      const dx_exprs = this.analyze_differential_form(expr);
      if(dx_exprs.length > 0)
        all_dx_exprs.push(...dx_exprs);
      else if(expr.is_whitespace())
        ;  // ignore whitespace
      else
        new_numer_exprs.push(expr);
    }
    if(new_numer_exprs.length === 0)
      new_numer_exprs.push(TextExpr.integer(1));
    const new_numer_expr = new_numer_exprs.length === 1 ?
          new_numer_exprs[0] : new SequenceExpr(new_numer_exprs);
    return [
      CommandExpr.frac(new_numer_expr, denom_expr),
      all_dx_exprs];
  }

  analyze_integral_sign(expr) {
    // Look for either a "raw" \int, etc. command, or a SubscriptSuperscriptExpr
    // with an \int command as the base.  In that case, the subscript and superscript
    // are assumed to be the integral limits.
    let lower_limit = null, upper_limit = null;
    if(expr.is_subscriptsuperscript_expr()) {
      [lower_limit, upper_limit] =
        [expr.subscript_expr, expr.superscript_expr];
      // Special case: interpret lower \mathcal{R} as -inf..+inf
      // (as created by the [/][i][R] keybinding).
      if(!upper_limit &&
         lower_limit.is_font_expr() && lower_limit.typeface === 'calligraphic' &&
         lower_limit.expr.is_text_expr_with('R')) {
        upper_limit = new CommandExpr('infty');
        lower_limit = PrefixExpr.unary_minus(upper_limit);
      }
      expr = expr.base_expr;  // look for \int in the base
    }
    if(!expr.is_command_expr_with(0))
      return null;
    // TODO: could handle \oint, etc. here too
    const integral_commands = {'int': 1, 'iint': 2, 'iiint': 3, 'iiiint': 4};
    if(expr.command_name in integral_commands)
      return {
        integral_count: integral_commands[expr.command_name],
        lower_limit: lower_limit,
        upper_limit: upper_limit
      };
    else return null;
  }

  // dx -> [x]
  // dx^dy -> [x, y]
  // Non-differential form -> []
  analyze_differential_form(expr) {
    if(!expr.is_differential_form())
      return [];
    else if(expr.is_infix_expr())  // dx^dy
      return [].concat(...expr.operand_exprs.map(
        operand_expr => this.analyze_differential_form()));
    else if(expr.is_sequence_expr())
      return [expr.exprs[1]];  // [d x] sequence -> x
    else
      return [];  // shouldn't happen
  }

  // Look for [dx dy] <integrand> [dz dw] patterns.
  // The differentials must come either at the beginning or end of the range
  // (or both, as an edge case: \iint dx 4xy dy).
  extract_integrand_and_differentials(exprs, start_index, stop_index,
                                      expected_differential_count) {
    let index = start_index;
    let all_dx_exprs = [];
    let integrand_terms = null;
    while(index < stop_index) {
      let expr = exprs[index];
      const dx_exprs = this.analyze_differential_form(expr);
      if(dx_exprs.length > 0) {
        // Record the differential(s).
        all_dx_exprs.push(...dx_exprs);
        index++;
      }
      else if(expr.is_whitespace()) {
        // Skip whitespace.
        index++;
      }
      // Non-differential form expression.
      else if(integrand_terms !== null) {
        // We've already found the integrand and now there are
        // no more differentials after the integrand - all done.
        break;
      }
      // Get the integrand - must be an Expr of the appropriate kind.
      else if(expr.is_infix_expr() &&
              expr.operator_exprs.every(
                operator_expr => operator_expr.is_command_expr_with(0, 'cdot'))) {
        // x \cdot y \cdot z
        integrand_terms = [expr];
        index++;
      }
      else if(expr.is_term_expr(true)) {
        // Collect implicit product terms until we hit something that's not
        // one, or hit a differential form (or run out of expressions to scan).
        integrand_terms = [];
        do {
          if(expr.is_command_expr_with(2, 'frac')) {
            // Check for differentials inside the numerators of fractions.
            const [new_frac_expr, dx_exprs] =
                  this.extract_differentials_from_fraction(expr);
            expr = new_frac_expr;
            all_dx_exprs.push(...dx_exprs);
          }
          integrand_terms.push(expr);
          index++;
          if(index < stop_index)
            expr = exprs[index];
        } while(index < stop_index &&
                !expr.is_differential_form() &&
                !expr.is_whitespace() &&
                expr.is_term_expr(false));
      }
      else if(all_dx_exprs.length === expected_differential_count) {
        // We've seen enough differentials to match the number of integral signs.
        // The integrand will be assumed to be '1'.  This handles: '\int\int dx dy'
        // and also '\int dx \int dy' (the second integration here will be handled
        // by the caller after the '\int dx').
        break;
      }
      else return {
        success: false,
        error_message: 'Could not find integrand'
      };
    }  // end while
    // Done with the scan.
    if(all_dx_exprs.length === expected_differential_count) {
      return {
        success: true,
        dx_exprs: all_dx_exprs,
        integrand_terms: integrand_terms || [],
        stopped_at_index: index
      };
    }
    else return {
      success: false,
      error_message: 'Number of differentials does not match number of integral signs'
    };
  }
}


// Recognize Leibniz (d/dx) derivative notation.
// Lagrange f'(x) and Newton \dot{y} notation are handled separately
// in their own Analyzer classes.  Note that with SymPy, everything
// is translated to the diff() function so 'd' and '\partial' are
// considered equivalent.
//
// The derivative operation can have the following forms:
// Single derivatives:
//   - \frac{d}{dx} x^2
//   - \frac{d}{dx} x \sin x
//   - \frac{d}{dx} (x + \sin x)
//   - \frac{d x^2}{dx}  (=> diff(x^2, x))
// Higher-order derivatives:
//   - \frac{d^2}{dx^2} x^3
//   - \frac{d^2 x^3}{dx^2}
// Mixed-partial derivatives:
//   - \frac{d^2}{dx dy} x^2 y
//   - \frac{d^2}{dx dy} (x^2 + y^2)
//   - \frac{\partial^2}{\partial x \partial y} (x^2 y)
//   - \frac{d^3}{dx^2 dy} (x^2 + y^2)
//
// The rules for what can be to the right of a d/dx-style derivative
// operator are the same for summands in a \sum expression:
// a sequence of implicit multiplications is allowed (like x^2 y), but
// lower-precedence things like x+y must be explicitly parenthesized.
//
// A form like dy/dx binds y->x as a dependent/independent variable pair,
// so that a plain 'y' elsewhere in the expression gets interpreted as
// y(x) automatically (to make writing differential equations easier).
//
// NOTE: This kind of derivative can be part of a SequenceExpr
// (in the case d/dx (...terms)), or a \frac CommandExpr on its own (dy/dx).
class LeibnizDerivativeAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    let index = start_index;
    const derivative_info = this
          .analyze_derivative_operator(exprs[index]);
    if(!derivative_info)
      return this.no_match();
    index++;
    const [
      error_message, f_expr, derivative_vars_info
    ] = derivative_info;
    if(error_message)
      return this.failure(error_message, start_index);
    // If we got a f_expr from 'df/dx', f is the expression to be
    // differentiated.  Otherwise, take 1 or more terms from the rest
    // of the sequence, e.g.: (d/dx) x sin(x)
    let diff_expr_node = null;
    if(f_expr) {
      // If f_expr is a simple variable name, it's considered a dependent
      // variable of the differentiation variable (the x from dx); record
      // that here (not done for mixed derivatives).
      if(derivative_vars_info.length === 1) {
        const f_var_name = expr_to_variable_name(f_expr);
        if(f_var_name)
          this.emitter.record_variable_dependency(
            f_var_name,
            derivative_vars_info[0][0],  // var_name field for dx in denominator
            'explicit');
      }
      diff_expr_node = this.emitter.emit_expr(f_expr);
    }
    else {
      // Collect one or more terms after the 'd/dx'.
      // This allows things like 'd/dx x sin(x)' which is a little
      // ambiguous notationwise ('d/dx (x sin(x))' would be better).
      // 'd/dx x sin(x) + x' is interpreted as '(d/dx x sin(x)) + x'.
      [diff_expr_node, index] =
            this.scan_implicit_product(exprs, index, stop_index);
      if(diff_expr_node === null) {
        // e.g. d/dx without anything after it.
        // This could technically be interpreted as a fraction
        // (simplifying to 1/x) but it's much more likely to be
        // an error.
        return this.failure(
          'Expected expression after differentiation operator',
          index);
      }
    }
    // Gather the differentiated variable(s) argument nodes.
    const diff_arg_nodes = derivative_vars_info.map(
      ([variable_name, degree_expr]) => {
        const variable_node = this.emitter.symbol(variable_name);
        if(degree_expr.is_text_expr_with('1'))
          return variable_node;  // diff(f, x)
        else
          return this.emitter.tuple(  // diff(f, (x, n))
            [variable_node, this.emitter.emit_expr(degree_expr)]);
      });
    // Build the diff(diff_expr, x, y, z) call.
    const diff_command_node = this.emitter.fncall(
      'diff', [diff_expr_node, ...diff_arg_nodes]);
    return this.success(diff_command_node, index);
  }

  // "Parse" df/dx-style derivative notation.  If expr doesn't match
  // a dy/dx form, null is returned, otherwise returns:
  //   [error_message, f_expr, derivative_vars_info]
  //   - 'error_message' will be null on success, otherwise the error string.
  //   - 'f_expr' will be the 'f' part of df/dx, or null for a d/dx-style form
  //     (and then the 'f' is expected to follow this d/dx part).
  //   - 'derivative_vars_info' is a list of [variable_name, degree_expr] with
  //     one entry for each denominator differential "term".
  //
  // Handles these general forms:
  //   df/dx   df(x)/dx    d^2f/dx^2  d^2f/dxdy
  //   d^2f(x,y)/dxdy      d/dx    d^2/dx^2    d^2/dxdy
  //
  // NOTE: The "degree" of the numerator must match the total degrees of
  // the denominator for higher-order derivatives (d^2/dx^3 not allowed, etc.)
  analyze_derivative_operator(expr) {
    if(!expr.is_command_expr_with(2, 'frac'))
      return null;
    const numerator_info = this
          .analyze_derivative_numerator(expr.operand_exprs[0]);
    if(!numerator_info)
      return null;
    // TODO: numerator_degree_expr not used;
    // should make sure it matches denominator degree(s)
    const [f_expr, /*numerator_degree_expr*/] = numerator_info;
    const denominator_info = this
          .analyze_derivative_denominator(expr.operand_exprs[1]);
    if(typeof denominator_info === 'string')  // error message
      return [denominator_info, f_expr, null];
    else
      return [null, f_expr, denominator_info];
  }

  // Look at the "numerator" of a dy/dx expression.
  // If it doesn't match one of these patterns, null is returned.
  // Otherwise returns [f_expr, degree_expr]:
  //   d (by itself): [null, 1]
  //   df:            [f, 1]
  //   d^n:           [null, n]
  //   d^n f:         [f, n]
  // NOTE: The degree_expr isn't actually used, all that is needed is
  // the "denominator" degrees for calling SymPy diff().
  // TODO: Should actually verify the numerator and denominator degrees match,
  // but we can have something like 'n' as the degree so might not always
  // be able to verify directly.
  analyze_derivative_numerator(numerator_expr) {
    let maybe_d_expr = null, f_expr = null;
    if(numerator_expr.is_sequence_expr()) {
      if(numerator_expr.exprs.length === 2)
        [maybe_d_expr, f_expr] = numerator_expr.exprs;
      else return null;
    }
    else maybe_d_expr = numerator_expr;
    // Check for d, d^2, d^n.
    let degree_expr = null;
    if(this.is_d_or_partial(maybe_d_expr))
      degree_expr = TextExpr.integer(1);
    else if(maybe_d_expr.is_subscriptsuperscript_expr() &&
            maybe_d_expr.superscript_expr &&
            !maybe_d_expr.subscript_expr &&
            this.is_d_or_partial(maybe_d_expr.base_expr)) {
      // NOTE: SymPy supports arbitrary expressions for the derivative
      // order via diff(expr, (x, n)).  So we can just use what's in the
      // d's exponent directly.
      degree_expr = maybe_d_expr.superscript_expr;
    }
    if(degree_expr)
      return [f_expr, degree_expr];
    else
      return null;
  }

  // Look at the "denominator" of a dy/dx expression.
  // This always has to be one or more 'plain' differentials
  // (not exterior dx^dy).  If not, an error string is returned.
  // Otherwise returns a list of [variable_name, degree_expr].
  // The "denominator differential" syntax is special in math notation:
  // dx^2 (which is a sequence [d, x^2]) actually means (dx)^2.
  // Exterior forms like dx^dy are not allowed in the denominator.
  // So we "manually" break up a sequence and look for [d, x^n] pairs.
  // NOTE: whitespace between differentials is filtered out.
  analyze_derivative_denominator(denom_expr) {
    if(!denom_expr.is_sequence_expr())
      return null;  // has to be a sequence of at least 2.
    const exprs = denom_expr.exprs;
    let results = [];
    // Alternate between expecting d or \partial, and expecting a variable x (or x^n).
    let expecting_d = true;
    for(const expr of exprs) {
      if(expr.is_whitespace()) {
        // Allow whitespace between differentials, but not between d and x
        if(expecting_d)
          continue;
        else
          return 'Invalid whitespace in dy/dx denominator';
      }
      if(expecting_d) {
        if(!this.is_d_or_partial(expr))
          return 'Expected only differentials in dy/dx denominator';
      }
      else {
        const dx_results = this
              .analyze_denominator_differential_variable(expr);
        if(dx_results)
          results.push(dx_results);
        else
          return 'Expected differential variable in dy/dx denominator';
      }
      expecting_d = !expecting_d;
    }
    if(results.length === 0)  // nothing but whitespace
      return 'Expected a differential variable in dy/dx denominator';
    else
      return results;
  }

  // Check for the 'x' part of dx, dx^2, etc.
  // Returns [variable_name, degree_expr] if valid (variable_name is a plain string),
  // or null if invalid.  The variable has to be a "simple" variable name (convertible
  // to SymPy symbol), and can have an optional 'power' indicating the differential degree.
  analyze_denominator_differential_variable(expr) {
    let degree_expr = null;
    if(expr.is_subscriptsuperscript_expr()) {
      degree_expr = expr.superscript_expr;
      expr = expr.with_superscript(null);  // strip the "power"
    }
    else degree_expr = TextExpr.integer(1);
    const variable_name = expr_to_variable_name(expr);
    if(variable_name)
      return [variable_name, degree_expr];
    else
      return null;
  }

  // Check for roman or italic 'd', or \partial.
  is_d_or_partial(expr) {
    return (expr.is_text_expr_with('d') ||
            (expr.is_font_expr() && expr.typeface === 'roman' &&
             expr.expr.is_text_expr_with('d')) ||
            expr.is_command_expr_with(0, 'partial'));
  }
}


// Recognize Lagrange derivative (prime) notation.
// The variable is always assumed to be 'x' unless explicitly specified
// as in f'(z).  In that case, the variable has to be a simple variable
// name, not a more complex expression.  f'(2z), f'(z^2) still use 'x' as
// the variable.
//
// Cases recognized:
//   - (x^2+c)' => diff(x^2+c, x)  (always use 'x' variable)
//   - (x + t)'(t) => diff(x+t, t)  (a FunctionCallExpr, 't' is the independent variable,
//                                   and the "function name" is the (x+t) subexpression)
//   - y' => diff(y(x), x)  (simple variables like 'y' get converted to FunctionCallExprs)
//   - y^2' => diff(y^2, x)  (anything more complex than a plain 'y' doesn't get turned into a function call)
//   - y_n' => diff(y_n, x)  (n in the subscript slot and \prime in the superscript)
//   - (x^2+c)'' => diff(x^2+c, (x, 2))
//   - f'(z) => diff(f(z), z)  (use 'z' if it's a simple variable name)
//   - f'(x, y) => not allowed, has to be a single argument
//   - f'(x^2+c) => diff(f(x^2+c), x)  (uses 'x' if the f(...) argument is not a simple variable)
//   - f^{(n)}(z) => diff(f(z), (z, n))  ("power" has to be parenthesized)
//   - f''(z)' => diff(f(z), (z, 3))  (edge case, primes add together)
class LagrangeDerivativeAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    let expr = exprs[start_index];
    if(this.check_for_dirac_delta(expr))
      return this.no_match();  // Dirac delta "function" is handled specially
    expr = this.analyze_independent_variable(expr);
    expr = this.analyze_primed_expr(expr);
    if(!this.derivative_order_expr)
      return this.no_match();  // no prime notation found; just an ordinary expr
    if(this.invalid_explicit_var)
      return this.failure(
        'Derivative variable must be a simple single variable',
        start_index);
    let independent_var_node = null;
    if(this.has_explicit_independent_var || !this.dependent_var_name)
      independent_var_node = this.emitter.symbol(this.independent_var_name);
    else if(this.dependent_var_name) {
      // Hack - this turns implicit y' into y'(x)
      independent_var_node = this.emitter.variable(
        this.dependent_var_name,
        true /* reverse_lookup */);
    }
    const diff_command_node = this.emitter.fncall(
      'diff', [
        this.emitter.emit_expr(expr),
        this.derivative_order_expr.is_text_expr_with('1') ?
          independent_var_node :  // diff(..., x)
          this.emitter.tuple([  // diff(..., (x, n))
            independent_var_node,
            this.emitter.emit_expr(this.derivative_order_expr)])]);
    return this.success(diff_command_node, start_index+1);
  }

  // Look for \delta^{\prime...}(x) and leave it alone (don't try to
  // differentiate it here).  Instead, it gets turned into a two-argument
  // DiracDelta() in FunctionCallAnalyzer.
  check_for_dirac_delta(expr) {
    return expr.is_function_call_expr() &&
      expr.fn_expr.is_subscriptsuperscript_expr() &&
      expr.fn_expr.count_primes() > 0 &&
      expr.fn_expr.with_superscript(null).is_command_expr_with(0, 'delta');
  }

  // Look for the x part of f'(x).  Otherwise, if it's something like
  // y' by itself, assume a default independent variable of x.  An explicit
  // y(z) or y''(z), etc., elsewhere in the expression can override this
  // assumption at code generation time.  This is handled through the
  // variable_dependencies table, see SymPyExpr for details.
  // This method returns the base expression after stripping any (x)
  // part of f'(x).
  analyze_independent_variable(expr) {
    this.independent_var_name = 'x';
    this.has_explicit_independent_var = false;
    this.invalid_explicit_var = false;
    if(!expr.is_function_call_expr())
      return expr;  // could be something like y'' or (x^2+1)'
    const argument_exprs = expr.extract_argument_exprs();
    if(argument_exprs.length === 1) {
      const var_name = expr_to_variable_name(argument_exprs[0]);
      if(var_name) {
        this.independent_var_name = var_name;
        this.has_explicit_independent_var = true;
      }
      else this.invalid_explicit_var = true;  // f(x^2)
    }
    else this.invalid_explicit_var = true;  // f(x,y)
    return expr.fn_expr;  // fn(x) => fn
  }

  // Returns the expression to be differentiated.
  analyze_primed_expr(expr) {
    this.derivative_order_expr = null;
    this.dependent_var_name = null;
    // Check for y'' or f^{(n)} forms.  f^{(n)} acts like n \primes,
    // but only if there was an explicit independent variable, as in f^{(n)}(x).
    if(expr.is_subscriptsuperscript_expr() && expr.count_primes() > 0)
      this.derivative_order_expr = TextExpr.integer(expr.count_primes());
    else if(this.has_explicit_independent_var &&
            expr.is_subscriptsuperscript_expr() && expr.superscript_expr &&
            expr.superscript_expr.is_delimiter_expr() &&
            expr.superscript_expr.left_type === '(' &&
            expr.superscript_expr.right_type === ')')
      this.derivative_order_expr = expr.superscript_expr.inner_expr;
    else
      return expr;  // no valid prime notation found
    expr = expr.with_superscript(null);  // remove \prime(s) or ^{(n)} notation
    this.dependent_var_name = expr_to_variable_name(expr);
    if(this.dependent_var_name) {
      // Explicit dependent variable like y (rather than a general expression
      // like (x^2+1).  Record the variable dependency.
      this.emitter.record_variable_dependency(
        this.dependent_var_name,
        this.independent_var_name,
        this.has_explicit_independent_var ? 'explicit' : 'assumed');
    }
    return expr;
  }
}


// Recognize Newton derivative notation: \dot{y}
// The variable is always assumed to be 't', similar to
// LagrangeDerivativeAnalyzer, unless explicitly given
// in a FunctionCallExpr as in \dot{y}(x).
//
// The expression to be analyzed may be either a CommandExpr or
// a FunctionCallExpr (for \dot{y} and \dot{y}(x) respectively).
//
// Cases recognized:
//   - \dot{x} => diff(x(t), t)  (always use 't' variable)
//   - \ddot{x} => diff(x(t), (t, 2))
//   - \dot{y}(z) => diff(y(z), z)  (use 'z' if it's an FunctionCallExpr with a simple variable)
class NewtonDerivativeAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    let expr = exprs[start_index];
    expr = this.analyze_independent_variable(expr);
    expr = this.analyze_implicit_notation(expr);
    // Same logic as in LagrangeDerivative.
    if(!expr)
      return this.no_match();
    if(this.invalid_explicit_var)
      return this.failure(
        'Derivative variable must be a simple single variable',
        start_index);
    if(this.invalid_dependent_var)
      return this.failure(
        'Dotted derivative must be a simple variable name',
        start_index);
    let independent_var_node = null;
    if(this.has_explicit_independent_var || !this.dependent_var_name)
      independent_var_node = this.emitter.symbol(this.independent_var_name);
    else if(this.dependent_var_name) {
      independent_var_node = this.emitter.variable(
        this.dependent_var_name,
        true /* reverse_lookup */);
    }
    const diff_command_node = this.emitter.fncall(
      'diff', [
        this.emitter.emit_expr(expr),
        this.derivative_order === 1 ?
          independent_var_node :  // diff(..., x)
          this.emitter.tuple([  // diff(..., (x, n))
            independent_var_node,
            this.emitter.number(this.derivative_order)])]);
    return this.success(diff_command_node, start_index+1);
  }

  // Same logic as LagrangeDerivative.analyze_independent_variable().
  // TODO: Make an intermediate AbstractDerivativeAnalyzer class
  // to factor this out.
  analyze_independent_variable(expr) {
    this.independent_var_name = 't';
    this.has_explicit_independent_var = false;
    this.invalid_explicit_var = false;
    if(!expr.is_function_call_expr())
      return expr;
    const argument_exprs = expr.extract_argument_exprs();
    if(argument_exprs.length === 1) {
      const var_name = expr_to_variable_name(argument_exprs[0]);
      if(var_name) {
        this.independent_var_name = var_name;
        this.has_explicit_independent_var = true;
      }
      else this.invalid_explicit_var = true;
    }
    else this.invalid_explicit_var = true;
    return expr.fn_expr;
  }

  // Check for "implicit" dot notation (\ddot{y} by itself without
  // being a FunctionCall) with a default 't' independent variable:
  // \ddot{y} => \ddot{y}(t)
  analyze_implicit_notation(expr) {
    const [base_expr, dot_count] = this.analyze_dots(expr);
    if(dot_count === 0)
      return null;
    this.derivative_order = dot_count;
    this.dependent_var_name = expr_to_variable_name(base_expr);
    if(this.dependent_var_name) {
      this.invalid_dependent_var = false;
      this.emitter.record_variable_dependency(
        this.dependent_var_name,
        this.independent_var_name,
        this.has_explicit_independent_var ? 'explicit' : 'assumed');
    }
    else  // \dot{x}: x must be a simple variable
      this.invalid_dependent_var = true;
      
    return base_expr;
  }

  // Returns [expr_without_dots, dot_count].
  // (This "unwraps" the dot command(s): \ddot{x} => [x, 2].)
  // This also handles nested dot commands, so for example
  // \dddots{\ddots{x}} => [x, 5].
  analyze_dots(expr) {
    // TODO: this is duplicated in CommandExpr.with_hat()
    const hat_info = [['dot', 1], ['ddot', 2], ['dddot', 3], ['ddddot', 4]];
    if(expr.is_command_expr_with(1)) {
      const match = hat_info.find(pair => pair[0] === expr.command_name);
      if(match) {
        const [inner_expr, inner_count] =
              this.analyze_dots(expr.operand_exprs[0]);
        return [inner_expr, inner_count + match[1]];
      }
    }
    return [expr, 0];
  }
}


// Recognize various CommandExprs that have a meaning to SymPy.
// These are generally single-Expr commands like \sin{x}, \frac{x}{y}, etc.
// One exception is '\operatorname{fn} x', using a one-argument \operatorname
// command followed by the actual command argument.
class CommandAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    const expr = exprs[start_index];
    if(!expr.is_command_expr())
      return this.no_match();
    const result_node = this.analyze_command_expr(expr);
    return this.success(result_node, start_index+1);
  }

  analyze_command_expr(expr) {
    // Some built-in commands use \operatorname{fn}{x} (a 2-argument CommandExpr).
    // These include: Tr(), sech(), csch(), erf(), erfc(), which aren't present in LaTeX.
    // For these cases, the command name and argument to use are extracted
    // from the \operatorname command.
    let args, nargs, command_name;
    if(expr.is_command_expr_with(2, 'operatorname') &&
       expr.operand_exprs[0].is_text_expr()) {
      args = expr.operand_exprs.slice(1);
      nargs = expr.operand_count()-1;
      command_name = expr.operand_exprs[0].text;
    }
    else {
      args = expr.operand_exprs;
      nargs = expr.operand_count();
      command_name = expr.command_name;
    }
    if(command_name === 'frac' && nargs === 2)
      return this.emitter.fncall('divide', [
        this.emitter.emit_expr(args[0]),
        this.emitter.emit_expr(args[1])]);
    // TODO: factor out all the [this.emitter.emit_expr(...)]
    if(command_name === 'sqrt' && nargs === 1) {
      if(expr.options) {
        // sqrt[3], etc.  The option is assumed to be valid (positive integer).
        return this.emitter.fncall(
          'root', [
            this.emitter.emit_expr(args[0]),
            this.emitter.number(expr.options)]);
      }
      else return this.emitter.fncall(
        'sqrt', this.emitter.emit_exprs(args));
    }
    // Check for unary functions like sin(x).
    // Translate 'Tr' => 'trace', etc. if needed.
    const sympy_command = translate_function_name(command_name, true);
    if(allowed_unary_sympy_functions.has(sympy_command) && nargs === 1)
      return this.emitter.fncall(sympy_command, this.emitter.emit_exprs(args));
    // Check for sin^2(x) where the ^2 is "baked in" to the command name.
    // These are always trig commands with the same name in sympy so they
    // don't need to be "translated".
    if(command_name.endsWith('^2')) {
      const base_command_name = command_name.slice(0, -2);
      if(allowed_unary_sympy_functions.has(base_command_name) && nargs === 1)
        return this.emitter.fncall('Pow', [
          this.emitter.fncall(
            base_command_name, this.emitter.emit_exprs(args)),
          this.emitter.number(2)]);
    }
    // Infinity is 'oo' in SymPy.
    if(command_name === 'infty' && nargs === 0)
      return this.emitter.number('oo');
    // Special case for \binom{n}{m}; this is the only two-argument
    // function used with SymPy.
    if(command_name === 'binom' && nargs === 2)
      return this.emitter.fncall('binomial', this.emitter.emit_exprs(args));
    // Zero-argument commands like \alpha are converted to their corresponding
    // alphanumeric variable name ('alpha').
    if(nargs === 0) {
      const variable_name = expr_to_variable_name(expr);
      if(variable_name) {
        if(variable_name === 'pi')  // special case for pi
          return this.emitter.number('pi');
        else
          return this.emitter.symbol(variable_name);
      }
    }
    return this.error('Cannot use "' + command_name + '" here', expr);
  }
}


// InfixExprs are flat lists of operators and operands, so we have
// to "parse" the terms and take into account operator precedence.
// (x+y*z => x+(y*z)).
class InfixAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    const expr = exprs[start_index];
    if(!expr.is_infix_expr())
      return this.no_match();
    const result_node = this.analyze_infix_expr(expr);
    return this.success(result_node, start_index+1);
  }

  analyze_infix_expr(infix_expr) {
    // Gather operator precedence, etc, for all infix operators, and
    // check that all are supported in SymPy.
    const operator_infos = infix_expr.operator_exprs.map(
      operator_expr => this.infix_operator_expr_info(operator_expr) ||
        this.error('Invalid binary operator', operator_expr));
    const operand_exprs = infix_expr.operand_exprs;
    this.node_stack = [this.emitter.emit_expr(operand_exprs[0])];
    this.operator_stack = [];  // stores operator info structures
    // Infix parseoid: convert initial node/operator stack to final SymPyNode.
    // Assumes left-associativity for everything.
    for(const [i, operator_info] of operator_infos.entries()) {
      while(this.operator_stack.length > 0 &&
            this.operator_stack.at(-1).prec >= operator_info.prec)
        this.resolve_infix_operator();
      this.operator_stack.push(operator_info);
      this.node_stack.push(this.emitter.emit_expr(operand_exprs[i+1]));
    }
    while(this.operator_stack.length > 0)
      this.resolve_infix_operator();
    // All that remains is the top-level SymPyNode on the stack.
    return this.node_stack.pop();
  }

  infix_operator_expr_info(expr) {
    let op_name = null;
    if(expr.is_text_expr())
      op_name = expr.text;  // something like + or /
    else if(expr.is_command_expr_with(0))
      op_name = expr.command_name;  // times, cdot, etc
    if(op_name)
      return this.infix_op_info(op_name);
    else
      return null;
  }

  // Take an operator and two nodes off the stacks, combining
  // them into a SymPy expression node that goes back on the stack.
  resolve_infix_operator() {
    const operator_info = this.operator_stack.pop();
    const rhs_node = this.node_stack.pop();
    const lhs_node = this.node_stack.pop();
    this.node_stack.push(
      this.emitter.fncall(operator_info.fn, [lhs_node, rhs_node]));
  }

  // { fn: binary sympy function to apply
  //   prec: precedence, higher numbers bind tighter }
  infix_op_info(op_name) {
    // NOTE: Mul/Add/etc are "native" SymPy operators (classes);
    // divide/subtract are created by the initialization in
    // load_pyodide_if_needed().
    switch(op_name) {
    case '*': return {fn: 'Mul', prec: 3};
    case 'cdot':
    case 'cross': return {fn: 'Mul', prec: 3};
    case '/':  return {fn: 'divide', prec: 3};
    case '+': return {fn: 'Add', prec: 2};
    case '-': return {fn: 'subtract', prec: 2};
    case '=': return {fn: 'Eq', prec: 1};
    case 'ne':
    case 'neq': return {fn: 'Ne', prec: 1};
    case '<':
    case 'lt': return {fn: 'Lt', prec: 1};
    case '>':
    case 'gt': return {fn: 'Gt', prec: 1};
    case '<=':
    case 'le': return {fn: 'Le', prec: 1};
    case '>=':
    case 'ge': return {fn: 'Ge', prec: 1};
    default: return null;
    }
  }
}


class FunctionCallAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    const expr = exprs[start_index];
    if(!expr.is_function_call_expr())
      return this.failure('Unexpected function call');  // shouldn't happen
    const arg_exprs = expr.extract_argument_exprs();
    if(arg_exprs.length === 0)
      return this.failure('Zero-argument function calls not allowed', start_index);
    const arg_nodes = this.emitter.emit_exprs(arg_exprs);
    const result_node =
          this.analyze_dirac_delta(expr, arg_nodes) ||
          this.analyze_sympy_function_call(expr, arg_nodes) ||
          this.analyze_generic_function_call(expr, arg_nodes);
    if(result_node)
      return this.success(result_node, start_index+1);
    else
      return this.failure('Invalid function call', start_index);
  }

  // Calling a built-in SymPy function (normally would be a CommandExpr).
  // TODO: revisit
  analyze_sympy_function_call(expr, arg_nodes) {
    if(expr.fn_expr.is_command_expr_with(0, 'theta') &&
       arg_nodes.length === 1) {
      // Heaviside step function.
      return this.emitter.fncall('Heaviside', arg_nodes);
    }
    return null;
  }

  // \delta(x) => DiracDelta(x)
  // \delta^{\prime}(x) => DiracDelta(x, 1)  (nth "derivative" of DD)
  // NOTE: The default "primed function call" derivative notation has
  // to be suppressed explicitly for \delta in LagrangeDerivativeAnalyzer.
  // TODO: maybe merge with analyze_sympy_function_call()
  analyze_dirac_delta(expr, arg_nodes) {
    if(arg_nodes.length !== 1)
      return null;
    let fn_expr = expr.fn_expr;
    let prime_count = 0;
    if(fn_expr.is_subscriptsuperscript_expr()) {
      prime_count = fn_expr.count_primes();
      fn_expr = fn_expr.with_superscript(null);
    }
    if(fn_expr.is_command_expr_with(0, 'delta')) {
      // "Differentiated" delta distribution has a second argument
      // to DiracDelta with the derivative order.
      return this.emitter.fncall(
        'DiracDelta', prime_count > 0 ?
          [...arg_nodes, this.emitter.number(prime_count)] :
          arg_nodes);
    }
    return null;
  }

  // f(x) -> Function('f')(Symbol('x'))
  // NOTE: 'f' needs to be a valid variable name, even though
  // FunctionCallExpr allows any expression in the function-name slot.
  analyze_generic_function_call(expr, arg_nodes) {
    const fn_name = expr_to_variable_name(expr.fn_expr);
    if(!fn_name)
      return null;
    // If we have y(x) where x is a simple variable name, keep track of
    // that variable dependency so we can replace 'y' => 'y(x)' elsewhere
    // when appropriate.
    if(arg_nodes.length === 1 && arg_nodes[0].is_variable_node())
      this.emitter.record_variable_dependency(
        fn_name, arg_nodes[0].name, 'explicit');
    return this.emitter.function_object_call(fn_name, arg_nodes);
  }
}


// Handle \sum and \prod operators:
//   \sum_{x=k}^{n} summand
//   \sum_{x=k} summand (x=k..\infty)
//   \sum_{x>=k} summand (x=k..\infty)
//   \sum_{x>k} summand (x=k+1..\infty)
//   \sum_{m<=i<=n} summand (< or <= can be used)
// The 'summand' is taken as one or more 'term expressions', which are combined
// with implicit multiplication.
// \prod is handled the same as \sum.
// These become SymPy summation(...) or product(...) calls.
class SumOrProductAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    let index = start_index;
    const operator_info = this.analyze_operator(exprs[index]);
    if(!operator_info)
      return this.no_match();
    if(operator_info.error_message)
      return this.failure(operator_info.error_message, index);
    index++;
    // Get the "argument" to the sum/product operator (one or more terms).
    const [summand_node, new_index] =
          this.scan_implicit_product(exprs, index, stop_index);
    if(summand_node) {
      const command_node = this.build_summation_command(
        summand_node, operator_info.operator_type, operator_info.variable_expr,
        operator_info.lower_limit_expr, operator_info.upper_limit_expr);
      return this.success(command_node, new_index);
    }
    else 
      return this.failure(
        'No valid expression to right of ' + operator_info.operator_type,
        index);
  }

  build_summation_command(summand_node, command_name, variable_expr,
                          lower_limit_expr, upper_limit_expr) {
    const variable_node = this.emitter.emit_expr(variable_expr);
    let argument_node = variable_node;
    if(lower_limit_expr && upper_limit_expr)
      argument_node = this.emitter.tuple([
        variable_node,
        this.emitter.emit_expr(lower_limit_expr),
        this.emitter.emit_expr(upper_limit_expr)]);
    return this.emitter.fncall(
      command_name,
      [summand_node, argument_node]);
  }

  analyze_operator(expr) {
    if(!expr.is_subscriptsuperscript_expr())
      return null;
    const operator_expr = expr.base_expr;
    const operator_type =
          operator_expr.is_command_expr_with(0, 'sum') ? 'summation' :
          operator_expr.is_command_expr_with(0, 'prod') ? 'product' :
          null;
    if(!operator_type)
      return null;
    const index_info = this.analyze_index_expr(expr.subscript_expr);
    if(!index_info)
      return {error_message: 'Invalid ' + operator_type + ' index'};
    // NOTE: If lower limit is 'x=k', upper limit must be provided.
    // But for 'x>=k', upper limit is assumed to be \infty if absent.
    const upper_limit_expr = expr.superscript_expr ?? index_info.upper_limit_expr;
    if(!upper_limit_expr)
      return {error_message: 'Invalid ' + operator_type + ' upper limit'};
    return {...index_info, operator_type, upper_limit_expr};
  }

  // Lower limit expression.  Allowed forms are:
  //   i=k, i>=k, i>k, m<=i<=n
  // In the latter case, either < or <= can be used.
  analyze_index_expr(expr) {
    if(!expr.is_infix_expr())
      return null;
    const operand_count = expr.operand_count();
    let variable_expr = null, lower_limit_expr = null, upper_limit_expr = null;
    const infty_expr = new CommandExpr('infty');
    if(operand_count === 2) {
      variable_expr = expr.operand_exprs[0];
      switch(expr.operator_text_at(0)) {
      case '=':
        lower_limit_expr = expr.operand_exprs[1];
        break;
      case '>': case 'gt':
        lower_limit_expr = expr.operand_exprs[1].increment(1);
        upper_limit_expr = infty_expr;
        break;
      case '>=': case 'ge':
        lower_limit_expr = expr.operand_exprs[1];
        upper_limit_expr = infty_expr;
        break;
      default:
        return null;
      }
    }
    else if(operand_count === 3) {
      [lower_limit_expr, variable_expr, upper_limit_expr] =
        expr.operand_exprs;
      switch(expr.operator_text_at(0)) {
      case '<=': case 'le': break;
      case '<': case 'lt':
        lower_limit_expr = lower_limit_expr.increment(1);
        break;
      default: return null;
      }
      switch(expr.operator_text_at(1)) {
      case '<=': case 'le': break;
      case '<': case 'lt':
        lower_limit_expr = lower_limit_expr.increment(-1);
        break;
      default: return null;
      }
    }
    else
      return null;
    // Index variable must translate to a valid variable name in SymPy.
    if(!expr_to_variable_name(variable_expr))
      return null;  // TODO: maybe return error instead
    return {variable_expr, lower_limit_expr, upper_limit_expr};
  }
}


// Handle limit notation.  The expression(s) after the \lim command
// must be a sequence of "terms" in the same sense as used for \sum and
// related commands.
//   \lim_{x\to 0} terms
//   \lim_{x\to \infty} terms
//   \lim_{x\to 0^{+}} terms (limit from the right; {-} for left)
//   \lim_{x\to 0+} terms (alternate notation for directional limits)
// NOTE: In LaTeX one way to express limits is: \lim\limits_{x=0}...
// but that case is not handled here (it could be).  Instead, we make
// sure to only create it with the {x=0} part directly as a subscript
// of \lim (and not use \limits).
class LimitAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    let index = start_index;
    const limit_info = this.analyze_limit(exprs[index]);
    if(!limit_info)
      return this.no_match();
    // TODO: check for "malformed" \lim expressions and return failure
    index++;
    // Collect the term(s) after the \lim command.
    const [limit_node, new_index] =
          this.scan_implicit_product(exprs, index, stop_index);
    if(limit_node) {
      const command_node = this.emitter.fncall(
        'limit', [
          limit_node,
          this.emitter.emit_expr(limit_info.variable_expr),
          this.emitter.emit_expr(limit_info.limit_value_expr),
          this.emitter.string(limit_info.direction)]);
      return this.success(command_node, index);
    }
    else return this.failure(
      'No valid expression to right of lim', index);
  }

  // Check for \lim_{...} and extract the variable, limit value,
  // and optional limit direction (+ or -).
  analyze_limit(expr) {
    // Must have \lim_{...} with no superscript on the \lim.
    if(!(expr.is_subscriptsuperscript_expr() &&
         expr.subscript_expr && !expr.superscript_expr &&
         expr.base_expr.is_command_expr_with(0, 'lim')))
      return null;
    const limit_expr = expr.subscript_expr;
    // Limit "spec" must be a binary infix expression with \to as
    // the operator, i.e. x \to 0.
    // TODO: This prevents things like x->y+1 (which is a 3-operand
    // InfixExpr).  May want to handle this case.
    if(!(limit_expr.is_infix_expr() && limit_expr.operand_count() === 2))
      return null;
    const [variable_expr, to_expr, val_expr] = [
      limit_expr.operand_exprs[0],
      limit_expr.operator_exprs[0],
      limit_expr.operand_exprs[1]];
    if(!to_expr.is_command_expr_with(0, 'to'))
      return null;  // TODO: could allow other arrow types here
    const variable_name = expr_to_variable_name(variable_expr);
    if(!variable_name)
      return null;  // limit variable must be expressible to SymPy
    let [limit_value_expr, direction] =
        this.analyze_limit_value(val_expr);
    return {
      variable_expr, variable_name,
      limit_value_expr, direction
    };
  }

  // Look at the '0+' part in x->0+.  We can have:
  //   - normal expression
  //   - value^{+ or -}
  //   - PostfixExpr(value, + or -)
  // TODO: also allow [val, '+' or '-'] concatenated sequence
  analyze_limit_value(expr) {
    let limit_value_expr = expr, direction = '+';
    if(expr.is_subscriptsuperscript_expr() &&
       expr.superscript_expr && !expr.subscript_expr &&
       ['+', '-'].some(dir_string =>
         expr.superscript_expr.is_text_expr_with(dir_string))) {
      limit_value_expr = val_expr.base_expr;
      direction = val_expr.superscript_expr.is_text_expr_with('+') ? '+' : '-';
    }
    else if(expr.is_postfix_expr() &&
            ['+', '-'].some(dir_string =>
              expr.operator_expr.is_text_expr_with(dir_string))) {
      limit_value_expr = val_expr.base_expr;
      direction = val_expr.operator_expr.is_text_expr_with('+') ? '+' : '-';
    }
    return [limit_value_expr, direction];
  }
}


const analyzer_table = {
  command: [
    LeibnizDerivativeAnalyzer,  // dy/dx
    NewtonDerivativeAnalyzer,  // \dot{y}
    // Fallback if it's not a \frac{dy}{dx} or \dot{y} or
    // similar command.
    CommandAnalyzer
  ],
  infix: [
    InfixAnalyzer
  ],
  function_call: [
    LagrangeDerivativeAnalyzer,  // f'(x)
    NewtonDerivativeAnalyzer,  // \dot{y}(x)
    FunctionCallAnalyzer
  ],
  subscriptsuperscript: [
    LagrangeDerivativeAnalyzer,  // y' or (x+3)'
    SubscriptSuperscriptAnalyzer
  ],
  // SequenceExprs use these; most "complicated" patterns occur
  // within sequences.
  sequence: [
    IntegralAnalyzer,
    LeibnizDerivativeAnalyzer,
    NewtonDerivativeAnalyzer,
    SumOrProductAnalyzer,
    LimitAnalyzer,
    // CommandAnalyzer needs to come after the others so that they have
    // a chance to examine \frac{dy}{dx}, \sum ..., etc.
    CommandAnalyzer,
    // Sequences of adjacent "terms" that don't have any other special
    // interpretation are generally treated as implicit multiplications
    // (such as 3 x \sin{x}).
    ImplicitProductAnalyzer
  ]
};


// Convert SymPy expressions back to Expr trees.
class SymPyToExpr {
  static sympy_to_expr(sympy_object) {
  }
}


// Number-formatting routines:

function format_double(x, max_decimal_digits = 9) {
  // Floating-point numbers don't necessarily need to be displayed
  // at full accuracy (after all, this is just an editor, not something
  // for "serious" calculation).  But enough precision is needed so that
  // things like converting \pi to a float and back (via RationalizeToExpr)
  // still work.  For now, the heuristic is:
  //   - max 9 digits of precision after the decimal point (or whatever
  //     is specified by max_decimal_digits)
  //   - trailing zeroes removed (0.75 instead of 0.750000000)
  //   - values close to an integer are rounded (2.999999999 => 3, no decimal point)
  if(Math.abs(Math.round(x) - x) < 1e-8)
    return Math.round(x).toString();
  else {
    const s = x.toFixed(max_decimal_digits).replace(/0+$/, '');
    // There's a chance we could wind up with something like "3.",
    // even though that should be caught by the almost-an-integer check above.
    return s.endsWith('.') ? s.slice(0, s.length-1) : s;
  }
}


function double_to_expr(x) {
  if(isNaN(x))
    return FontExpr.roman_text('NaN');
  else if(isFinite(x)) {
    const abs_x = Math.abs(x);
    if(abs_x < 1e-30)
      return TextExpr.integer(0);
    if(abs_x < 1e-8 || abs_x > 1e9)
      return double_to_scientific_notation_expr(x);
    else {
      // Here, x is known to have a "reasonable" exponent so
      // that toString() will not output scientific notation.
      const expr = new TextExpr(format_double(abs_x));
      if(x < 0.0)
        return PrefixExpr.unary_minus(expr);
      else return expr;
    }
  }
  else {
    const infty_expr = new CommandExpr('infty');
    if(x < 0.0)
      return PrefixExpr.unary_minus(infty_expr);
    else return infty_expr;
  }
}

function double_to_scientific_notation_expr(x) {
  // Convert to "3e+4", or else "Infinity", "NaN", etc.
  // The 9 here should match the toFixed(9) in format_double().
  const exp_string = x.toExponential(9);  
  // Split on e+ and e- both explicitly, in case e.g. "Infinity" happened to have an "e" in it.
  const [pieces_positive, pieces_negative] =
        [exp_string.split('e+'), exp_string.split('e-')];
  const [coefficient_text, exponent_text, exponent_is_negative] =
        pieces_positive.length === 2 ?
        [...pieces_positive, false] : [...pieces_negative, true];
  const coefficient_is_negative = coefficient_text.startsWith('-');
  const coefficient_expr = coefficient_is_negative ?
        PrefixExpr.unary_minus(new TextExpr(coefficient_text.slice(1))) :
        new TextExpr(coefficient_text);
  let exponent_expr = new TextExpr(exponent_text);
  if(exponent_is_negative)
    exponent_expr = PrefixExpr.unary_minus(exponent_expr);
  // 3 \cdot 10^4
  return InfixExpr.combine_infix(
    coefficient_expr,
    TextExpr.integer(10).with_superscript(exponent_expr),
    new CommandExpr('cdot'));
}


export {
  PyodideInterface, SymPyCommand, ExprToSymPy,
  format_double, double_to_expr,
  latex_letter_commands
};

