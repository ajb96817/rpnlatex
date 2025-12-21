

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

// TODO
const allowed_sympy_functions = new Set([
  'sin', 'cos'
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


// 'to_algebrite'=true converts from editor commands to SymPy
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
    const command_code = this.generate_command_code(
      sympy_item.function_name,
      sympy_item.arg_exprs,
      sympy_item.arg_options);
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
    const new_expr = new SymPyExpr(
      result.result_expr.srepr, result.result_expr.latex,
      result.variable_name);
    const new_item = new ExprItem(new_expr, null, null);
    this.app_component.handle_sympy_command_finished(command_id, new_item);
  }

  generate_command_code(function_name, arg_exprs, arg_options) {
    const insert_artificial_delay = false;
    // Generate builder functions, one per argument expression.
    const builder_function_name = (index) => 'build_expr_' + index.toString();
    const builder_function_codes = arg_exprs
          .map((arg_expr, arg_index) => {
            return new ExprToSymPy()
              .expr_to_code(arg_expr, builder_function_name(arg_index));
          });
    // Generate a function to build all the argument expressions and
    // execute the requested command.
    let lines = [];
    if(insert_artificial_delay)
      lines.push('import time');
    lines.push('def execute_command():');
    lines.push(...arg_exprs.map((arg_expr, arg_index) =>
      ['  arg_', arg_index.toString(),
       ' = ', builder_function_name(arg_index), '()'
      ].join('')));
    let arg_pieces = arg_exprs.map(
      (arg_expr, arg_index) => 'arg_'+arg_index.toString());
    for(const [option_name, option_value] of arg_options)
      arg_pieces.push([option_name, '=', option_value].join(''));
    const arg_string = arg_pieces.join(', ');
    lines.push([
      '  result = ',
      function_name, '(', arg_string, ')'].join(''));
    // Convert the result expression into srepr/latex format
    // and return a dict structure.
    if(insert_artificial_delay)
      lines.push('  time.sleep(2)');
    lines.push(
      "  result_srepr = srepr(result)",
      "  result_latex = latex(result)",
      "  return {'result_expr': {'srepr': result_srepr, 'latex': result_latex}}")
    const execute_command_code = lines.join("\n")
    // Assemble everything together.
    return [
      ...builder_function_codes,
      execute_command_code,
      'execute_command()'
    ].join("\n");
  }
}


// Helper tree node classes for converting Exprs to SymPy expression
// builder functions.
class SymPyNode {}

// Numbers, etc.
class SymPyConstant extends SymPyNode {
  constructor(value_string) {
    super();
    this.value_string = value_string;
  }
  to_py_string() {
    return ['sympify(', this.value_string, ')'].join('');
  }
}

// Symbol('x'), but an explicit symbol table is created in the builder
// function and that table is referenced instead of calling Symbol.
class SymPySymbol extends SymPyNode {
  constructor(name, index, source_expr = null) {
    super();
    this.name = name;
    this.index = index;
    this.source_expr = source_expr;
  }
  to_py_string() {
    return [
      's[', this.index.toString(), ']']
      .join('');
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
      ' = ', this.value_node.to_py_string()
    ].join('');
  }
}

// f(x,y,z)
class SymPyFunctionCall extends SymPyNode {
  constructor(function_name, args) {
    super();
    this.function_name = function_name;
    this.args = args;
  }
  to_py_string() {
    const arg_pieces = this.args
          .map(arg_node => arg_node.to_py_string())
          .join(', ');
    return [this.function_name, '(', arg_pieces, ')']
      .join('');
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


class ExprToSymPy {
  constructor() {
    this.symbol_table = {};
    this.symbol_list = [];  // linear list of what is in symbol_table
    this.assignment_list = [];
    this.subexpression_count = 0;
  }

  // TODO: fix this
  error(message, offending_expr = null) {
    throw new Error(message);
  }

  expr_to_code(expr, builder_function_name) {
    const return_node = this.emit_expr(expr);
    return this.generate_code(builder_function_name, return_node);
  }

  generate_code(builder_function_name, return_node) {
    let lines = [];
    lines.push(['def ', builder_function_name, '():'].join(''));
    const symbol_names = this.symbol_list
          .map(symbol => ["'", symbol.name, "'"].join(''))
          .join(', ');
    lines.push(['  symbol_names = [', symbol_names, ']'].join(''));
    lines.push('  s = [Symbol(symbol_name) for symbol_name in symbol_names]')
    // Assemble subexpressions.
    for(const assignment of this.assignment_list)
      lines.push(['  ', assignment.to_py_string()].join(''));
    // Return last subexpression.
    lines.push(['  return ', return_node.to_py_string()].join(''));
    return lines.join("\n");
  }

  // Only one Symbol per distinct variable name is created.
  symbol(variable_name, source_expr = null) {
    const old_symbol = this.symbol_table[variable_name];
    if(old_symbol) return old_symbol;
    const new_symbol = new SymPySymbol(
      variable_name, this.symbol_list.length, source_expr);
    this.symbol_table[variable_name] = new_symbol;
    this.symbol_list.push(new_symbol);
    return new_symbol;
  }

  number(value) {
    return new SymPyConstant(value.toString());
  }

  srepr(srepr_string) {
    return this.add_assignment(
      new SymPySRepr(srepr_string));
  }

  fncall(function_name, args = []) {
    return this.add_assignment(
      new SymPyFunctionCall(function_name, args));
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
    default: return this.error('Unknown expr type: ' + expr.expr_type());
    }
  }

  emit_text_expr(expr) {
    if(expr.looks_like_number())
      return this.number(expr.text);
    const variable_name = expr_to_variable_name(expr);
    if(variable_name)
      return this.symbol(variable_name);
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
  emit_infix_expr(infix_expr) {
    // Gather operator precedence, etc, for all infix operators, and
    // check that all are supported in SymPy.
    const operator_infos = infix_expr.operator_exprs.map(
      operator_expr => this._infix_operator_expr_info(operator_expr) ||
        this.error('Invalid binary operator', operator_expr));
    const operand_exprs = infix_expr.operand_exprs;
    const node_stack = [this.emit_expr(operand_exprs[0])];
    const operator_stack = [];  // stores operator info structures
    for(const [i, operator_info] of operator_infos.entries()) {
      while(operator_stack.length > 0 &&
            operator_stack[operator_stack.length-1].prec >= operator_info.prec)
        this._resolve_infix_operator(node_stack, operator_stack);
      operator_stack.push(operator_info);
      node_stack.push(this.emit_expr(operand_exprs[i+1]));
    }
    while(operator_stack.length > 0)
      this._resolve_infix_operator(node_stack, operator_stack);
    // All that remains is the top-level SymPyNode on the stack.
    return node_stack.pop();
  }
  _infix_operator_expr_info(expr) {
    let op_name = null;
    if(expr.is_text_expr())
      op_name = expr.text;  // something like + or /
    else if(expr.is_command_expr_with(0))
      op_name = expr.command_name;  // times, cdot, etc
    if(op_name)
      return this._infix_op_info(op_name);
    else
      return null;
  }
  // Take an operator and two nodes off the stacks, combining
  // them into a SymPy expression node that goes back on the stack.
  _resolve_infix_operator(node_stack, operator_stack) {
    const operator_info = operator_stack.pop();
    let rhs_node = node_stack.pop();
    const lhs_node = node_stack.pop();
    node_stack.push(
      this.fncall(operator_info.fn, [lhs_node, rhs_node]));
  }
  // { fn: binary sympy function to apply
  //   prec: higher numbers bind tighter }
  _infix_op_info(op_name) {
    switch(op_name) {
    case '*': return {fn: 'Mul', prec: 2};
    case 'cdot': return {fn: 'Mul', prec: 2};
    // case 'times': return {fn: 'cross', prec: 2};  // TODO: revisit
    case '/': return {fn: 'divide', prec: 2};
    case '+': return {fn: 'Add', prec: 1};
    case '-': return {fn: 'subtract', prec: 1};
    default: return null;
    }
  }

  // Only '+' and '-' prefix operators are supported (and + is disregarded).
  emit_prefix_expr(prefix_expr) {
    if(prefix_expr.operator_expr.is_text_expr()) {
      switch(prefix_expr.operator_expr.text) {
      case '-': return this.fncall(
        'negate', [this.emit_expr(prefix_expr.base_expr)]);
      case '+': return this.emit_expr(prefix_expr.base_expr);
      }
    }
    return this.error('Invalid prefix operator', prefix_expr);
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
    const fn_expr = expr.fn_expr;
    const arg_exprs = expr.extract_argument_exprs();
    const arg_count = arg_exprs.length;
    if(arg_count === 0)
      return this.error('Malformed function call', expr);
    const variable_expr = arg_exprs[0];
    // Check for f'(x), f''(x).
    // Here, 'x' must be a simple variable name; f'(x^2) not allowed.
    const prime_count = fn_expr.is_subscriptsuperscript_expr() ?
          fn_expr.count_primes() : 0;
    if(arg_count === 1 && prime_count > 0 &&
       expr_to_variable_name(variable_expr)) {
      // Remove one prime from the FunctionCallExpr, using that as the argument
      // to a d() call.  If there is more than one prime, this will
      // recurse until we arrive at f(x).  f''(x) => d(d(f(x),x),x)
      alert('derivative notation not yet implemented');
      // return new AlgebriteCall('d', [
      //   this.expr_to_node(
      //     new FunctionCallExpr(fn_expr.remove_prime(), expr.args_expr)),
      //   this.expr_to_node(variable_expr)]);
    }
    // The usual case (not f'(x)):
    const fn_name = expr_to_variable_name(fn_expr);
    if(fn_name)
      return this.fncall(
        fn_name, arg_exprs
          .map(arg_expr => this.emit_expr(arg_expr)));
    else 
      return this.error('Invalid function', expr);
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
      return this.fncall('divide', [
        this.emit_expr(args[0]),
        this.emit_expr(args[1])]);
    if(command_name === 'sqrt' && nargs === 1) {
      if(expr.options) {
        // sqrt[3], etc.  The option is assumed to be valid (positive integer).
        return this.fncall('root', [this.emit_expr(args[0]), this.number(expr.options)]);
      }
      else
        return this.fncall('sqrt', [this.emit_expr(args[0])]);
    }
    // Check for unary functions like sin(x).
    // Translate 'Tr' => 'contract', etc. if needed.
    const sympy_command = translate_function_name(command_name, true);
    if(allowed_sympy_functions.has(sympy_command) && nargs === 1)
      return this.fncall(sympy_command, [this.emit_expr(args[0])]);
    // Special case for \binom{n}{m}; this is the only two-argument
    // function used with Algebrite.
    if(command_name === 'binom' && nargs === 2)
      return this.fncall('binomial', [this.emit_expr(args[0]), this.emit_expr(args[1])]);
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
      // return new AlgebriteCall('power', [
      //   new AlgebriteCall(match[1], [this.expr_to_node(args[0])]),
      //   new AlgebriteNumber(match[2].toString())]);
    }
    
    // Zero-argument commands like \alpha are converted to their corresponding
    // alphanumeric variable name ('alpha').
    if(nargs === 0) {
      const variable_name = expr_to_variable_name(expr);
      if(variable_name)
        return this.symbol(variable_name);
    }
    return this.error('Cannot use "' + command_name + '" here', expr);
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
      // return new AlgebriteCall(
      //   'eval', [
      //     this.expr_to_node(base_expr.inner_expr),
      //     this.expr_to_node(lhs),
      //     this.expr_to_node(rhs)]);
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

  // SequenceExprs are mostly assumed to be implicit multiplications.
  sequence_expr_to_node(expr) {
    const exprs = expr.exprs;
    const term_nodes = [];  // arguments to a multiply(...) call
    for(let i = 0; i < exprs.length; i++) {
      // Look for \operatorname{something} followed by another expression,
      // assumed to be the operator's argument.  Sequences like this could
      // created by [/][f] commands (like 'erf'), or by finishing math
      // entry mode with [Tab] to create an operatorname.
      // If the operator name is a valid Algebrite function, convert
      // the two-Expr sequence into a function call.
      if(i < exprs.length-1 &&
         exprs[i].is_command_expr_with(1, 'operatorname') &&
         exprs[i].operand_exprs[0].is_text_expr()) {
        const sympy_command = translate_function_name(
          exprs[i].operand_exprs[0].text, true);
        if(allowed_sympy_functions.has(sympy_command)) {
          // TODO: handle multi-argument functions
          term_nodes.push(this.fncall(
            sympy_command, [this.emit_expr(exprs[i+1])]));
          i++;
          continue;
        }
      }
      // // Look for d/dx f(x) (two adjacent terms in a SequenceExpr).
      // // Convert to d(f(x), x) calls.  Any parentheses around the
      // // f(x) part are stripped: d/dx (arg x) => d(arg(x), x)
      // if(i < exprs.length-1) {
      //   const variable_expr = this._analyze_derivative(exprs[i]);
      //   if(variable_expr) {
      //     term_nodes.push(new AlgebriteCall(
      //       'd', [this.expr_to_node(exprs[i+1]),
      //             this.expr_to_node(variable_expr)]));
      //     i++;
      //     continue;
      //   }
      // }
      // // Look for chains of 2 or more adjacent matrices literals;
      // // these are converted into inner(M1, M2, ...) calls here
      // // without needing an explicit \cdot.
      // let matrix_count = 0;
      // for(let j = i; j < exprs.length && exprs[j].is_matrix_expr();
      //     j++, matrix_count++)
      //   ;
      // if(matrix_count >= 2) {
      //   term_nodes.push(
      //     new AlgebriteCall(
      //       'inner',
      //       exprs.slice(i, i+matrix_count).map(
      //         arg_expr => this.expr_to_node(arg_expr))));
      //   i += matrix_count-1;
      //   continue;
      // }
      // Ordinary term.
      term_nodes.push(this.emit_expr(exprs[i]));
    }
    if(term_nodes.length === 1)  // e.g. nothing but inner(M1, M2, ...)
      return term_nodes[0];
    else
      return this.fncall('Mul', term_nodes);
  }

  emit_sympy_expr(expr) {
    // SymPyExpr already has the 'srepr' direct representation available; use that.
    return this.srepr(expr.srepr_string);
  }
}



export { PyodideInterface };

