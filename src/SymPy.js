

import {
  Expr, CommandExpr, FontExpr, InfixExpr, PrefixExpr,
  PostfixExpr, FunctionCallExpr,
  TextExpr, SequenceExpr, DelimiterExpr,
  ArrayExpr, PlaceholderExpr, SubscriptSuperscriptExpr,
  SymPyExpr
} from './Exprs';
import {
  ExprItem, SymPyItem
} from './Models';


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
  ['log_{10}', 'log10']  // not yet implemented in the editor
];

const allowed_unary_sympy_functions = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth',
  'asin', 'acos', 'atan', 'asec', 'acsc', 'acot',
  'asinh', 'acohs', 'atanh', 'asech', 'acsch', 'acoth',

  'det', 'trace', 're', 'im', 'log', 'log2', 'log10'
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

// TODO: remove (probably)
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

// Scan an expression and try to find the variable to use for the
// "implicit variable" for SymPy commands like [#][d] (derivative).
// Returns [variable_name_string, variable_expr].
// If no variable is found, or if there's more than one like in
// sin(y*z) and therefore ambiguous, returns [null, null].
function guess_variable_in_expr(expr) {
  // SymPy expressions may already be tagged with the previously
  // used or guessed variable name.
  if(expr.is_sympy_expr() && expr.variable_name)
    return [expr.variable_name, variable_name_to_expr(variable_name)];
  const var_map = {};
  _guess_variable_in_expr(expr, var_map);
  const var_names = Object.getOwnPropertyNames(var_map);  // not ideal
  if(var_names.length === 1)
    return [var_names[0], var_map[var_names[0]]];
  // Always use x or t if it's there, even if there are other
  // potential variables present (unless x and t are both present).
  else if(var_map['x'] && !var_map['t'])
    return ['x', var_map['x']];
  else if(var_map['t'])
    return ['t', var_map['t']];
  else
    return [null, null];
}
function _guess_variable_in_expr(expr, var_map) {
  const variable_name = expr_to_variable_name(expr, true);
  if(variable_name &&
     !['e', 'pi', 'i'].includes(variable_name))
    var_map[variable_name] = expr;
  // We don't necessarily want to look for variables in every possible
  // subexpression; for example with x_a, the variable should be x_a as
  // a whole, even though it has the subexpressions 'x' and 'a'.
  let subexpressions = [];
  if(expr.is_function_call_expr())
    subexpressions.push(expr.args_expr);  // don't look at the function name itself
  else if(expr.is_subscriptsuperscript_expr()) {
    // Never recurse into subscripts, and if there is a subscript, don't
    // recurse into the base expression itself.  Always check superscripts though.
    if(expr.superscript_expr)
      subexpressions.push(expr.superscript_expr);
    if(!expr.subscript_expr)
      subexpressions.push(expr.base_expr);
  }
  else if(expr.is_infix_expr())
    subexpressions = expr.operand_exprs;  // don't look at the operators, only operands
  else if(expr.is_font_expr()) {
    // Don't look inside FontExprs; if it's \bold{x} we want 'bold_x',
    // not the 'x' inside.  This will miss variables inside other kinds
    // of bolded expressions, however.
  }
  else
    subexpressions = expr.subexpressions();
  for(const subexpr of subexpressions)
    _guess_variable_in_expr(subexpr, var_map);
}


class PyodideInterface {
  constructor(app_component) {
    this.app_component = app_component;
    this.change_state('uninitialized');
  }

  // TODO: fix this
  error(message) {
    throw new Error(message);
  }

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

  post_worker_message(data) {
    if(this.worker)
      this.worker.postMessage(data);
  }

  handle_worker_message(data) {
    switch(data.message) {
    case 'loading': this.change_state('loading'); break;
    case 'ready': this.change_state('ready'); break;
    case 'running': this.change_state('running'); break;
    case 'command_finished':
      this.command_finished(data.command_id, data.result);
      this.change_state('ready');
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

  // TODO: remove
  guess_variable_in_expr(expr) {
    return guess_variable_in_expr(expr);
  }

  expr_to_variable_name(expr) {
    return expr_to_variable_name(expr);
  }

  variable_name_to_expr(variable_name) {
    return variable_name_to_expr(variable_name);
  }

  start_executing(sympy_item) {
    if(!this.start_pyodide_worker_if_needed())
      return this.error('Pyodide not available');
    const command_code = this.generate_command_code(sympy_item.command);
    console.log(command_code);
    const message = {
      command: 'sympy_command',
      command_id: sympy_item.status.command_id,
      code: command_code
    };
    this.post_worker_message(message);
    window.setTimeout(() => {
      this.app_component.update_long_running_sympy_items()
    }, SymPyItem.long_running_computation_threshold());
  }

  command_finished(command_id, result) {
    let new_item_fn = null;
    if(result.result === 'error')
      new_item_fn = (sympy_item) => sympy_item.with_new_status({
        state: 'error',
        error_message: result.error_message,
        errored_expr: result.errored_expr ?
          new SymPyExpr(
            result.errored_expr.srepr,
            result.errored_expr.latex) : null
      });
    else
      new_item_fn = (sympy_item) => new ExprItem(
        new SymPyExpr(
          result.result_expr.srepr,
          result.result_expr.latex));
    this.app_component.resolve_pending_item(
      command_id, new_item_fn);
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
    if(insert_artificial_delay)
      lines.push('import time');
    lines.push(
      'def execute_command():',
      ...arg_exprs.map((arg_expr, arg_index) =>
        ['  arg_', arg_index.toString(),
         ' = ', builder_function_name(arg_index), '()'
        ].join('')));
    if(insert_artificial_delay)
      lines.push('  time.sleep(2)');
    const arguments_string = arg_exprs
          .map((arg_expr, arg_index) => 'arg_'+arg_index.toString())
          .concat(extra_args)
          .join(', ');
    lines.push([
      '  result = ', function_name,
      '(', arguments_string, ')'].join(''));
    if(transform_result_code)
      lines.push(['  result = ' + transform_result_code])
    // Convert the result expression into srepr/latex format
    // and return a dict structure.
    lines.push(`  return {
      'result': 'success',
      'result_expr': {
        'srepr': srepr(result),
        'latex': latex(result)
      } }`, '');
    const execute_command_code = lines.join("\n")
    // Build an exception-handling wrapper around execute_command();
    // this will return an error-result structure if needed.
    lines = [`def execute_command_safe():
  try:
    return execute_command()
  except Exception as ex:
    result_obj = {
      'result': 'error',
      'error_message': str(ex)
    }`];
    if(arg_exprs.length > 0) {
      // "Blame" the error on the first argument expression if there is one.
      // This rebuilds the SymPy argument expr using the previously-created
      // builder function.  Could re-use the already-built expr, but passing
      // to the exception handler is awkward.
      lines.push(
        ['    errored_expr = ', builder_function_name(0), '()'
        ].join(''),
        "    result_obj['errored_expr'] = {",
        "      'srepr': srepr(errored_expr),",
        "      'latex': latex(errored_expr)",
        "    }");
    }
    lines.push('    return result_obj', '');
    // Assemble everything together.
    const execute_command_safe_code = lines.join("\n");
    return [
      ...builder_function_codes,
      execute_command_code,
      execute_command_safe_code,
      'execute_command_safe()',
      ''
    ].join("\n");
  }
}


// Helper tree node classes for converting Exprs to SymPy expression
// builder functions.
class SymPyNode {}

// Numbers, etc.
class SymPyConstant extends SymPyNode {
  constructor(value_string, raw = false) {
    super();
    this.value_string = value_string;
    this.raw = raw;
  }
  to_py_string() {
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
  to_py_string() {
    return ["Symbol('", this.name, "')"].join('');
  }
}

// Named subexpression (expr_1 = ...)
class SymPySubexpression extends SymPyNode {
  constructor(expr_number) {
    super();
    this.expr_number = expr_number;
  }
  to_py_string() {
    return 'expr_' + this.expr_number.toString();
  }
}

// Function-call-and-assignment; becomes: expr_2 = Add(expr_1, 10)
class SymPyAssignment extends SymPyNode {
  constructor(subexpression_node, value_node) {
    super();
    this.subexpression_node = subexpression_node;
    this.value_node = value_node;
  }
  to_py_string() {
    return [
      this.subexpression_node.to_py_string(),
      this.value_node.to_py_string()
    ].join(' = ');
  }
}

// f(x,y,z) - Call a built-in SymPy function.
// Used for Python tuples too (x,y,z).
class SymPyFunctionCall extends SymPyNode {
  constructor(function_name, args) {
    super();
    this.function_name = function_name;
    this.args = args;
  }
  to_py_string() {
    const args_string = this.args
          .map(arg_node => arg_node.to_py_string())
          .join(', ');
    return [this.function_name, '(', args_string, ')']
      .join('');
  }
}

// Function('f')(x,y,z) - Symbolic function call.
class SymPyFunctionObjectCall extends SymPyNode {
  constructor(name, args) {
    super();
    this.name = name;
    this.args = args;
  }
  to_py_string() {
    const args_string = this.args
          .map(arg_node => arg_node.to_py_string())
          .join(', ');
    return ["Function('", this.name, "')(", args_string, ')'
           ].join('');
  }
}

// Direct srepr() string of a SymPy expression.
class SymPySRepr extends SymPyNode {
  constructor(srepr_string) {
    super();
    this.srepr_string = srepr_string;
  }
  to_py_string() {
    return this.srepr_string;
  }
}


// This handles the overall conversion of Expr trees to SymPy code.
class ExprToSymPy {
  // Given an Expr tree, try to build a string of Python code
  // that will create the corresponding SymPy expression.
  // The generated code will be a Python function with the
  // supplied 'builder_function_name'.
  static expr_to_code(expr, builder_function_name) {
    return new this().expr_to_code(expr, builder_function_name);
  }
  
  constructor() {
    this.assignment_list = [];  // contains SymPyAssignments
    this.subexpression_count = 0;  // serial number for expr_1,2,3 in generated code
  }

  // TODO: fix this
  error(message, offending_expr = null) {
    throw new Error(message);
  }

  // NOTE: expr can be null here; will be converted to None.
  expr_to_code(expr, builder_function_name) {
    const return_node = expr ? this.emit_expr(expr) : new SymPySRepr('None');
    return this.generate_code(builder_function_name, return_node);
  }

  generate_code(builder_function_name, return_node) {
    let lines = [];
    lines.push(['def ', builder_function_name, '():'].join(''));
    for(const assignment of this.assignment_list)
      lines.push(['  ', assignment.to_py_string()].join(''));
    lines.push(['  return ', return_node.to_py_string()].join(''));
    lines.push('');
    return lines.join("\n");
  }

  symbol(variable_name) {
    return new SymPySymbol(variable_name);
  }

  number(value) {
    return new SymPyConstant(value.toString());
  }

  srepr(srepr_string) {
    return this.add_assignment(
      new SymPySRepr(srepr_string));
  }

  // Call a SymPy function.
  fncall(function_name, args = []) {
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
    if(args.length === 1)  // special case (x,) Python syntax
      return this.fncall('', args.concat([new SymPyConstant('', true)]));
    else
      return this.fncall('', args);
  }

  add_assignment(value_node) {
    const subexpr_node = new SymPySubexpression(this.subexpression_count++);
    const assignment_node = new SymPyAssignment(subexpr_node, value_node);
    this.assignment_list.push(assignment_node);
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

  emit_text_expr(expr) {
    if(expr.looks_like_number())
      return this.number(expr.text);
    const variable_name = expr_to_variable_name(expr);
    if(variable_name) {
      // Special case for 'i' (imaginary unit).
      if(variable_name === 'i')
        return this.number('I');
      else
        return this.symbol(variable_name);
    }
    else
      return this.error('Invalid variable name', expr);
  }

  emit_font_expr(expr) {
    // If this is a valid bolded variable name, use that, otherwise
    // ignore the font and convert the base expression.
    const variable_name = expr_to_variable_name(expr);
    if(variable_name)
      return this.symbol(variable_name);
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
  emit_prefix_expr(prefix_expr) {
    switch(prefix_expr.operator_text()) {
    case '-': return this.fncall(
      'negate', [this.emit_expr(prefix_expr.base_expr)]);
    case '+': return this.emit_expr(prefix_expr.base_expr);
    default: return this.error('Invalid prefix operator', prefix_expr);
    }
  }
      
  // Single and double factorials are supported.
  emit_postfix_expr(postfix_expr) {
    const [base_expr, factorial_signs_count] = postfix_expr.analyze_factorial();
    if(factorial_signs_count === 1)
      return this.fncall('factorial', [this.emit_expr(base_expr)]);
    else if(factorial_signs_count === 2)
      return this.fncall('factorial2', [this.emit_expr(base_expr)]);
    else if(factorial_signs_count > 1)
      return this.error('Multiple factorial not supported', postfix_expr);
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
    const [base_expr, subscript_expr, superscript_expr] =
          [expr.base_expr, expr.subscript_expr, expr.superscript_expr];
    // Check for for "where" expressions of the form: f|_{x=y}.
    if(base_expr.is_delimiter_expr() &&
       base_expr.left_type === '.' && base_expr.right_type === "\\vert" &&
       subscript_expr && subscript_expr.is_infix_expr() &&
       subscript_expr.operator_text_at(0) === '=') {
      if(superscript_expr)
        return this.error('Cannot use superscript here', expr);
      const lhs = subscript_expr.operand_exprs[0];
      const rhs = subscript_expr.extract_side_at(0, 'right');
      alert("where syntax not yet implemented");
    }
    // Check for subscripted variable names (x_1).
    // A possible superscript becomes the exponent.
    if(subscript_expr) {
      const variable_name = expr_to_variable_name(expr, true /* ignore_superscript */);
      if(!variable_name)
        return this.error('Invalid variable subscript', expr);
      if(superscript_expr)
        return this.fncall('Pow', [
          this.symbol(variable_name),
          this.emit_expr(superscript_expr)]);
      else
        return this.symbol(variable_name);
    }
    // Anything else with a subscript isn't allowed.
    if(subscript_expr)
      return this.error('Cannot use subscript here', expr);
    // Check for matrix_expr^{\textrm{T}} (transpose).
    // Perform the transpose internally rather than calling
    // transpose(A) with SymPy.
    if(superscript_expr &&
       base_expr.is_matrix_expr() &&
       (superscript_expr.is_text_expr_with('T') ||
        (superscript_expr.is_font_expr() && superscript_expr.typeface === 'roman' &&
         superscript_expr.expr.is_text_expr_with('T')))) {
      return this.emit_expr(base_expr.transposed());
    }
    // Check for e^x (both roman and normal 'e').
    if(superscript_expr &&
       (base_expr.is_text_expr_with('e') ||
        (base_expr.is_font_expr() && base_expr.typeface === 'roman' &&
         base_expr.expr.is_text_expr_with('e'))))
      return this.fncall('exp', [this.emit_expr(superscript_expr)]);
    // Check for x^{\circ} (degrees notation).  Becomes x*pi/180.
    // if(superscript_expr &&
    //    superscript_expr.is_command_expr_with(0, 'circ'))
    //   return new AlgebriteCall('multiply', [
    //     this.expr_to_node(base_expr),
    //     new AlgebriteVariable('pi'),
    //     new AlgebriteCall('reciprocal', [new AlgebriteNumber('180')])]);
    // x^y with no subscript on x.
    if(superscript_expr)
      return this.fncall('Pow', [
        this.emit_expr(base_expr),
        this.emit_expr(superscript_expr)]);
    // Shouldn't get here.
    return this.emit_expr(base_expr);
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


// Abstract superclass for Expr pattern-matching rules.
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

  multiply_all(term_nodes) {
    if(term_nodes.length === 1)
      return term_nodes[0];
    else return this.emitter.fncall('Mul', term_nodes);
  }
}


// Multiply adjacent "term" expressions together.
// This is the default if no other rule matches in a SequenceExpr.
class ImplicitProductAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    if(exprs[start_index].is_term_expr(start_index === 0))
      return this.success(
        this.emitter.emit_expr(exprs[start_index]),
        start_index+1);
    else
      return this.failure(
        'Term not allowed in an implicit product',
        start_index);
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
    let integral_limit_exprs = [];
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
      // Multiply all integrand terms together.
      const integrand_term_nodes = integrand_terms
            .map(term_expr => this.emitter.emit_expr(term_expr));
      const integrand_node = this.multiply_all(integrand_term_nodes);
      // Build integrate() SymPy calls from the "inside out".
      const integrate_command_node =
            this.build_integrate_command(
              integrand_node, integral_limit_exprs, dx_exprs);
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
    else {
      // Check individual top-level pieces of the numerator and
      // build the (possible) new numerator.
      for(const expr of
          numer_expr.is_sequence_expr() ? numer_expr.exprs : [numer_expr]) {
        const dx_exprs = this.analyze_differential_form(expr);
        if(dx_exprs.length > 0)
          all_dx_exprs.push(...dx_exprs);
        else if(expr.is_whitespace())
          ;  // ignore whitespace
        else
          new_numer_exprs.push(expr);
      }
    }
    if(new_numer_exprs.length === 0)
      new_numer_exprs.push(TextExpr.integer(1));
    const new_numer_expr = new_numer_exprs.length === 1 ?
          new_numer_exprs[0] : new SequenceExpr(new_numer_exprs);
    return [CommandExpr.frac(new_numer_expr, denom_expr), all_dx_exprs];
  }

  analyze_integral_sign(expr) {
    // Look for either a "raw" \int, etc. command, or a SubscriptSuperscriptExpr
    // with an \int command as the base.  In this case, the subscript and superscript
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
  // (or both, as an edge case: \iint dx 2xy dy).
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
// Lagrange f'(x) and Newton \dot{y} notation are handled separately.
// Note that with SymPy, everything is translated to the diff() function,
// so 'd' and '\partial' are considered equivalent.
// The derivative operation can have the following forms:
// Single derivatives:
//   - \frac{d}{dx} x^2
//   - \frac{d}{dx} x \sin x
//   - \frac{d}{dx} (x + \sin x)
//   - \frac{d x^2}{dx}
// Higher-order derivatives:
//   - \frac{d^2}{dx^2} x^3
//   - \frac{d^2 x^3}{dx^2}
// Mixed-partial derivatives:
//   - \frac{d^2}{dx dy} x^2 y
//   - \frac{d^2}{dx dy} (x^2 + y^2)
//   - \frac{\partial^2}{\partial x \partial y} (x^2 y)
//   - \frac{d^2}{dx^2 dy} (x^2 + y^2)
// Note that the rules for what can be to the right of the derivative
// operator are the same for integrands in integral expressions:
// a sequence of implicit multiplications is allowed (like x^2 y), but
// lower-precedence things like x+y must be explicitly parenthesized.
class DerivativeAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    let index = start_index;
    const derivative_info = this
          .analyze_derivative_operator(exprs[index++]);
    if(!derivative_info)
      return this.no_match();
    const [f_expr, differentials_info] = derivative_info;
    // If we got a f_expr from 'df/dx', that's the expression to be
    // differentiated.  Otherwise, we take 1 term from the rest of the
    // sequence.  In the future, this could be expanded to multiple
    // terms to support things like (d/dx) x \sin x.  For now it has to
    // be parenthesized.
    let diff_expr = null;
    if(f_expr)
      diff_expr = f_expr;
    else if(index < stop_index)
      diff_expr = exprs[index++];
    else {
      // e.g. d/dx without anything after it.
      // This could technically be interpreted as a fraction
      // (simplifying to 1/x) but it's much more likely to be
      // an error.
      return this.failure(
        'Expected expression after differentiation operator',
        index);
    }
    // Build the diff(diff_expr, x, y, z) call.
    const diff_args = differentials_info.map(info => {
      const variable_node = this.emitter.emit_expr(info.variable_expr);
      if(info.degree_expr.is_text_expr_with('1'))
        return variable_node;  // diff(f, x)
      else
        return this.emitter.tuple(  // diff(f, (x, n))
          [variable_node, this.emitter.emit_expr(info.degree_expr)]);
    });
    const diff_expr_node = this.emitter.emit_expr(diff_expr);
    const diff_command_node = this.emitter.fncall(
      'diff', [diff_expr_node].concat(diff_args));
    return this.success(diff_command_node, index);
  }

  analyze_derivative_operator(expr) {
    if(!expr.is_command_expr_with(2, 'frac'))
      return null;
    const numer_info = this.analyze_d_numerator(expr.operand_exprs[0]);
    const denom_info = this.analyze_d_denominator(expr.operand_exprs[1]);
    if(!(numer_info && denom_info))
      return null;  // doesn't match pattern
    return [numer_info.f_expr, denom_info];
  }

  // Look at the "numerator" of a dy/dx expression.
  // If it doesn't match one of these patterns, null is returned.
  // Otherwise:
  //   d (by itself): {degree_expr: 1, f_expr: null}
  //   df:    {degree_expr: 1, f_expr: f}
  //   d^n:   {degree_expr: n, f_expr: null}
  //   d^n f: {degree_expr: n, f_expr: f}
  // NOTE: The degree_expr isn't actually used, all that is needed is
  // the "denominator" degrees for calling SymPy diff().
  analyze_d_numerator(numer_expr) {
    let maybe_d_expr = null, f_expr = null;
    if(numer_expr.is_sequence_expr()) {
      if(numer_expr.exprs.length === 2)
        [maybe_d_expr, f_expr] = numer_expr.exprs;
      else return null;
    }
    else maybe_d_expr = numer_expr;
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
      degree_expr = expr.superscript_expr;
    }
    if(!degree_expr)
      return null;
    return {
      degree_expr: degree_expr,
      f_expr: f_expr
    };
  }

  // Look at the "denominator" of a dy/dx expression.
  // This always has to be one or more 'plain' differentials
  // (not exterior dx^dy).  If not, null is returned.  Otherwise
  // return a list of {variable_expr: x, degree_expr: n}.
  // NOTE: whitespace between differentials is filtered out.
  analyze_d_denominator(denom_expr) {
    let exprs = null;
    if(denom_expr.is_sequence_expr() && denom_expr.is_differential_form(true))
      exprs = [denom_expr];  // 2-element differential sequence ('d', 'x')
    else if(denom_expr.is_sequence_expr())
      exprs = denom_expr.exprs;  // sequence that should contain only differentials
    else
      exprs = [denom_expr];  // possibly a single differential expr (shouldn't happen currently)
    const results = exprs
          .filter(expr => !expr.is_whitespace())
          .map(expr => {
            if(expr.is_sequence_expr()) {  // exclude dx^dy
              const degree_expr = expr.is_differential_form(true);
              if(degree_expr)
                return {degree_expr: degree_expr, variable_expr: expr.exprs[1]};
            }
            return null;
          });
    // TODO: return failures for the failed cases here
    if(results.length === 0)
      return null;  // nothing but whitespace
    else if(results.some(result => result === null))
      return null;  // something wasn't a differential
    else
      return results;
  }

  // Check for roman or italic 'd', or \partial.
  is_d_or_partial(expr) {
    return (expr.is_text_expr_with('d') ||
            (expr.is_font_expr() && expr.typeface === 'roman' &&
             expr.expr.is_text_expr_with('d')) ||
            expr.is_command_expr_with(0, 'partial'));
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
    if(command_name === 'sqrt' && nargs === 1) {
      if(expr.options) {
        // sqrt[3], etc.  The option is assumed to be valid (positive integer).
        return this.emitter.fncall('root', [this.emitter.emit_expr(args[0]), this.number(expr.options)]);
      }
      else
        return this.emitter.fncall('sqrt', [this.emitter.emit_expr(args[0])]);
    }
    // Check for unary functions like sin(x).
    // Translate 'Tr' => 'trace', etc. if needed.
    const sympy_command = translate_function_name(command_name, true);
    if(allowed_unary_sympy_functions.has(sympy_command) && nargs === 1)
      return this.emitter.fncall(sympy_command, [this.emitter.emit_expr(args[0])]);
    // Infinity is 'oo' in SymPy.
    if(command_name === 'infty' && nargs === 0)
      return this.emitter.number('oo');
    // Special case for \binom{n}{m}; this is the only two-argument
    // function used with SymPy.
    if(command_name === 'binom' && nargs === 2)
      return this.emitter.fncall('binomial', [this.emitter.emit_expr(args[0]), this.emitter.emit_expr(args[1])]);
    // Handle sin^2(x), etc.  These are currently implemented in rpnlatex by
    // having the command_name be a literal 'sin^2'.  This needs to be translated
    // as sin^2(x) => sin(x)^2 for SymPy.  Also, reciprocal trig functions
    // need to be translated as csc^2(x) => sin(x)^(-2).
    const match = [
      // [rpnlatex, sympy_function, power]
      ['sin^2', 'sin', 2],    ['cos^2', 'cos', 2],    ['tan^2', 'tan', 2],
      ['sinh^2', 'sinh', 2],  ['cosh^2', 'cosh', 2],  ['tanh^2', 'tanh', 2],
      ['sec^2', 'cos', -2],   ['csc^2', 'sin', -2],   ['cot^2', 'tan', -2],
      ['sech^2', 'cosh', -2], ['csch^2', 'sinh', -2], ['coth^2', 'tanh', -2]
    ].find(pair => command_name === pair[0]);
    if(match && nargs === 1) {
      alert('sin^2 etc not yet implemented');
    }
    
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
  //   prec: higher numbers bind tighter }
  infix_op_info(op_name) {
    // NOTE: Mul/Add/etc are "native" SymPy operators (classes);
    // divide/subtract are created by the initialization
    // in load_pyodide_if_needed().
    switch(op_name) {
    case '*': return {fn: 'Mul', prec: 3};
    case 'cdot': case 'cross': return {fn: 'Mul', prec: 3};
    case '/': return {fn: 'divide', prec: 3};
    case '+': return {fn: 'Add', prec: 2};
    case '-': return {fn: 'subtract', prec: 2};
    case '=': return {fn: 'Eq', prec: 1};
    case 'ne': case 'neq': return {fn: 'Ne', prec: 1};
    case '<': case 'lt': return {fn: 'Lt', prec: 1};
    case '>': case 'gt': return {fn: 'Gt', prec: 1};
    case '<=': case 'le': return {fn: 'Le', prec: 1};
    case '>=': case 'ge': return {fn: 'Ge', prec: 1};
    default: return null;
    }
  }
}


class FunctionCallAnalyzer extends Analyzer {
  analyze(exprs, start_index, stop_index) {
    const expr = exprs[start_index];
    this.arg_exprs = expr.extract_argument_exprs();
    if(this.arg_exprs.length === 0)
      return this.failure('Zero-argument function calls not allowed', start_index);
    this.arg_nodes = this.arg_exprs.map(
      arg_expr => this.emitter.emit_expr(arg_expr));
    const result_node = this.analyze_function_call_expr(expr);
    if(result_node)
      return this.success(result_node, start_index+1);
    else return this.failure('Invalid function call', start_index);
  }

  analyze_function_call_expr(expr) {
    return this.analyze_sympy_function_call(expr) ||
      this.analyze_lagrange_derivative(expr) ||
      this.analyze_generic_function_call(expr);
  }

  // Calling a built-in SymPy function (normally would be a CommandExpr).
  analyze_sympy_function_call(expr) {
    return null;
  }

  // f'(x), f''(x)
  analyze_lagrange_derivative(expr) {
    if(!expr.is_function_call_expr()) return null;
    const fn_expr = expr.fn_expr;
    if(!fn_expr.is_subscriptsuperscript_expr()) return null;
    const prime_count = fn_expr.count_primes();
    if(prime_count === 0) return null;
    const fn_name = expr_to_variable_name(fn_expr.base_expr);
    if(!fn_name) return null;  // 'f' can't be a "complex" expression
    if(this.arg_exprs.length !== 1) {
      // f(x,y), etc. disallowed
      return this.error('Derivative must be a one-argument function');
    }
    const variable_expr = this.arg_exprs[0];
    if(!expr_to_variable_name(variable_expr)) {
      // f'(x^2), etc.
      return this.error('Derivative argument must be a simple variable');
    }
    const fn_call_node = this.emitter
          .function_object_call(fn_name, this.arg_nodes);
    const diff_command_node = this.emitter.fncall(
      'diff', [
        fn_call_node,
        this.arg_nodes[0],
        this.emitter.number(prime_count)]);
    return diff_command_node;
  }

  // f(x) -> Function('f')(Symbol('x'))
  // NOTE: 'f' needs to be a valid variable name, even though
  // FunctionCallExpr allows any expression in the function-name slot.
  analyze_generic_function_call(expr) {
    if(!expr.is_function_call_expr()) return null;
    const fn_name = expr_to_variable_name(expr.fn_expr);
    if(!fn_name) return null;
    return this.emitter.function_object_call(fn_name, this.arg_nodes);
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
    // Get "argument" to the sum/product operator.
    let summand_exprs = [];
    while(index < stop_index &&
          exprs[index].is_term_expr(index === start_index+1)) {
      summand_exprs.push(exprs[index]);
      index++;
    }
    if(summand_exprs.length === 0)
      return this.failure(
        'No valid expression to right of ' + operator_info.operator_type,
        index);
    const summand_term_nodes = summand_exprs
          .map(term_expr => this.emitter.emit_expr(term_expr));
    const summand_node = summand_term_nodes.length > 1 ?
          this.emitter.fncall('Mul', summand_term_nodes) :
          summand_term_nodes[0];
    const command_node = this.build_summation_command(
      summand_node, operator_info.operator_type, operator_info.variable_expr,
      operator_info.lower_limit_expr, operator_info.upper_limit_expr);
    return this.success(command_node, index);
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
    const operand_count = expr.operand_exprs.length;
    let variable_expr = null, lower_limit_expr = null, upper_limit_expr = null;
    const infty_expr = new CommandExpr('infty');
    if(operand_count === 2) {
      variable_expr = expr.operand_exprs[0];
      switch(expr.operator_text_at(0)) {
      case '=':
        lower_limit_expr = expr.operand_exprs[1];
        break;
      case '>': case 'gt':
        lower_limit_expr = Infix.add_exprs(
          expr.operand_exprs[1], TextExpr.integer(1));
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
      lower_limit_expr = expr.operand_exprs[0];
      variable_expr = expr.operand_exprs[1];
      upper_limit_expr = expr.operand_exprs[2];
      switch(expr.operator_text_at(0)) {
      case '<=': case 'le':
        break;
      case '<': case 'lt':
        lower_limit_expr = Infix.add_exprs(
          lower_limit_expr, TextExpr.integer(1));
        break;
      default:
        return null;
      }
      switch(expr.operator_text_at(1)) {
      case '<=': case 'le':
        break;
      case '<': case 'lt':
        lower_limit_expr = Infix.add_exprs(
          lower_limit_expr, TextExpr.integer(-1));
        break;
      default:
        return null;
      }
    }
    else
      return null;
    // Index variable must translate to a valid variable name in SymPy.
    if(!expr_to_variable_name(variable_expr))
      return null;
    return {variable_expr, lower_limit_expr, upper_limit_expr};
  }
}


const analyzer_table = {
  command: [
    // CommandExprs try these analyzers with themselves as the
    // expression list (as if they were single-element SequenceExprs).
    // This allows for trying 'dy/dx' before the default \frac{dy}{dx}
    // handler gets to it.
    DerivativeAnalyzer,
    CommandAnalyzer
  ],
  infix: [InfixAnalyzer],
  function_call: [FunctionCallAnalyzer],
  sequence: [
    // SequenceExprs use these; most "complicated" patterns occur
    // within sequences.
    IntegralAnalyzer,
    DerivativeAnalyzer,
    SumOrProductAnalyzer,
    // CommandAnalyzer needs to come after DerivativeAnalyzer so that
    // the latter has a chance to examine \frac{dy}{dx}, \sum ..., etc.
    CommandAnalyzer,
    // Sequences that don't have any other special interpretation
    // are generally treated as implicit multiplications
    // (such as 3 x \sin{x}).
    ImplicitProductAnalyzer
  ]
};


export { PyodideInterface };

