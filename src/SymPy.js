

import {
  loadPyodide
} from 'pyodide';

import {
  Expr, CommandExpr, FontExpr, InfixExpr, PrefixExpr,
  PostfixExpr, FunctionCallExpr,
  TextExpr, SequenceExpr, DelimiterExpr,
  ArrayExpr, PlaceholderExpr, SubscriptSuperscriptExpr
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
  ['log_{10}', 'log10']  // not yet implemented in the editor
];


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


// Scan an expression and try to find the variable to use for the
// "implicit variable" for Algebrite commands like [#][d] (derivative).
// Returns [variable_name_string, variable_expr].
// If no variable is found, or if there's more than one like in
// sin(y*z) and therefore ambiguous, returns [null, null].
function guess_variable_in_expr(expr) {
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
  constructor() {
    this.change_state('uninitialized');
  }

  version() {
    return this.py ? this.py.version : null;
  }

  change_state(new_state) {
    this.state = new_state;
    if(this.onStateChange)
      this.onStateChange(this, new_state);
  }

  async initialize() {
    this.change_state('starting');
    const pyodide = await loadPyodide({indexURL: 'public'});
    this.change_state('initializing');
    this.py = pyodide;
    await pyodide.loadPackage("sympy", {checkIntegrity: false});
    pyodide.runPython('from sympy import *');
    pyodide.runPython(`
      def log2(x): return log(x,2)
      def log10(x): return log(x,10)
`);
    this.change_state('ready');
  }

  // TODO: Not sure if there's a better way to "shut down", or if just
  // letting it get garbage-collected is good enough.
  shutdown() {
    this.py = null;
    this.change_state('uninitialized');
  }

  execute(code) {
    if(this.state === 'ready')
      return this.py.runPython(code);
    else
      alert('pyodide not ready');
  }
}


class SymPySymbol {
  constructor(name, index, source_expr = null) {
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

class SymPyConstant {
  constructor(value_string) {
    this.value_string = value_string;
  }
  to_py_string() {
    return this.value_string;
  }
}

// Becomes: expr_2 = Add(expr_1, 10)
class SymPyAssignment {
  constructor(expr_number, function_name, args) {
    this.expr_number = expr_number;
    this.function_name = function_name;
    this.args = args;
  }
  to_py_string() {
    return 'expr_' + this.expr_number.toString();
  }
}


class ExprToSymPy {
  constructor() {
    this.symbol_table = {};
    this.symbol_list = [];  // linear list of what is in symbol_table
    this.assignment_list = [];
  }

  generate_code() {
    let lines = [];
    lines.push('def build_expr():');
    const symbol_names = this.symbol_list
          .map(symbol => ["'", symbol.name, "'"].join(''))
          .join(', ');
    lines.push(['  symbol_names = [', symbol_names, ']'].join(''));
    lines.push('  s = [Symbol(symbol_name) for symbol_name in symbol_names]')
    for(assignment of this.assignment_list) {
      let pieces = [
        '  ', /* line indentation */
        assignment.to_py_string(),
        ' = ', assignment.function_name, '('];
      for(arg of assignment.args)
        pieces.push(arg.to_py_string());
      pieces.push(')');
      lines.push(pieces.join(''));
    }
    // Return last subexpression.
    lines.push([
      '  return ',
      this.assignment_list[this.assignment_list.length-1]
        .to_py_string()
    ].join(''));
    return lines.join("\\n");
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

  assignment(function_name, args = []) {
    const assignment = new SymPyAssignment(
      this.assignment_list.length, function_name, args);
    this.assignment_list.push(assignment);
    return assignment;
  }

  expr_to_node(expr) {
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
    const node_stack = [this.expr_to_node(operand_exprs[0])];
    const operator_stack = [];  // stores operator info structures
    for(const [i, operator_info] of operator_infos.entries()) {
      while(operator_stack.length > 0 &&
            operator_stack[operator_stack.length-1].prec >= operator_info.prec)
        this._resolve_infix_operator(node_stack, operator_stack);
      operator_stack.push(operator_info);
      node_stack.push(this.expr_to_node(operand_exprs[i+1]));
    }
    while(operator_stack.length > 0)
      this._resolve_infix_operator(node_stack, operator_stack);
    // All that remains is the top-level AlgebriteNode on the stack.
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
  // them into a AlgebriteNode that goes back on the stack.
  _resolve_infix_operator(node_stack, operator_stack) {
    const operator_info = operator_stack.pop();
    let rhs_node = node_stack.pop();
    const lhs_node = node_stack.pop();
    if(operator_info.modifier_fn)
      rhs_node = new AlgebriteCall(operator_info.modifier_fn, [rhs_node]);
    this._check_infix_operator_arguments(operator_info.fn, lhs_node, rhs_node);
    node_stack.push(new AlgebriteCall(operator_info.fn, [lhs_node, rhs_node]));
  }

  _check_infix_operator_arguments(fn, lhs_node, rhs_node) {
    const [lhs_is_tensor, rhs_is_tensor] =
          [lhs_node, rhs_node].map(node => node instanceof AlgebriteTensor);
    if(fn === 'add') {
      // Avoid an Algebrite bug with adding a scalar to a vector/matrix
      // (x + [y, z]).
      if(lhs_is_tensor !== rhs_is_tensor)
        this.error('Cannot mix scalar and matrix addition');
    }
    if(fn === 'cross') {
      if(!(lhs_is_tensor && lhs_node.column_count === 1 && lhs_node.row_count === 3 &&
           rhs_is_tensor && rhs_node.column_count === 1 && rhs_node.row_count === 3))
        this.error('Cross product requires two 3-dimensional vectors');
    }
  }

  // { fn: binary algebrite function to apply
  //   modifier_fn: unary algebrite function to apply to second argument
  //                (e.g., x/y => multiply(x, quotient(y)))
  //   prec: higher numbers bind tighter }
  _infix_op_info(op_name) {
    switch(op_name) {
    case '*': return {fn: 'multiply', prec: 2};
    case '/': return {fn: 'multiply', modifier_fn: 'reciprocal', prec: 2};
    // case 'times': return {fn: 'cross', prec: 2};  // TODO: revisit, should only apply this to literal vector pairs
    case 'times':
    case 'cdot': return {fn: 'inner', prec: 2};
    case '+': return {fn: 'add', prec: 1};
    case '-': return {fn: 'add', modifier_fn: 'negative', prec: 1};
    default: return null;
    }
  }

  
}


export { PyodideInterface };

