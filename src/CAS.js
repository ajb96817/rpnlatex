

import {
  // TODO: may not need all these
  Expr, CommandExpr, FontExpr, InfixExpr, PrefixExpr,
  PostfixExpr, FunctionCallExpr,
  PlaceholderExpr, TextExpr, SequenceExpr, DelimiterExpr,
  SubscriptSuperscriptExpr, ArrayExpr
} from './Exprs';

import {
  LatexEmitter
} from './Models';

import Algebrite from 'algebrite';


// LaTeX commands like \alpha that can be treated as variable names
// in Algebrite by spelling out the command name.
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

const allowed_algebrite_unary_functions = new Set([
  // Built-in Algebrite commands:
  'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh',
  'arcsin', 'arccos', 'arctan', 'arcsinh', 'arccosh', 'arctanh',
  'log', 'choose', 'contract', 'det', 'curl', 'div',
  'add', 'multiply', 'quotient', 'cross', 'inner',
  
  // Custom functions added to Algebrite by rpnlatex:
  'sec', 'csc', 'cot', 'sech', 'csch', 'coth',
  'arcsec', 'arccsc', 'arccot', 'arcsech', 'arccsch', 'arccoth',
  'log2', 'log10',

  // Custom functions for handling - and /:
  'negative', 'reciprocal'
]);
  
// [rpnlatex_command, algebrite_command]
const algebrite_function_translations = [
  ['sin^{-1}', 'arcsin'],
  ['cos^{-1}', 'arccos'],
  ['tan^{-1}', 'arctan'],
  ['sec^{-1}', 'arcsec'],
  ['csc^{-1}', 'arccsc'],
  ['cot^{-1}', 'arccot'],
  ['sinh^{-1}', 'arcsinh'],
  ['cosh^{-1}', 'arccosh'],
  ['tanh^{-1}', 'arctanh'],
  ['sech^{-1}', 'arcsech'],
  ['csch^{-1}', 'arccsch'],
  ['coth^{-1}', 'arccoth'],
  ['Tr', 'contract'],
  ['binom', 'choose'],
  ['ln', 'log'],
  ['log_2', 'log2'],
  ['lg', 'log2'],
  ['log_{10}', 'log10']  // not yet implemented in the editor
];

// 'to_algebrite'=true converts from editor commands to Algebrite
// (binom->choose), false is the inverse.
function translate_function_name(f, to_algebrite) {
  const match = algebrite_function_translations.find(
    pair => pair[to_algebrite ? 0 : 1] === f);
  if(match) return match[to_algebrite ? 1 : 0];
  else return f;
}

// Check if a variable name is acceptable by Algebrite.
function is_valid_variable_name(s, allow_initial_digit) {
  const regex = allow_initial_digit ?
        /^[a-zA-Z0-9_]+$/g : /^[a-zA-Z][a-zA-Z0-9_]*$/g;
  return regex.test(s);
}

// If possible, convert an Expr to the corresponding Algebrite
// variable name.  Greek letters and subscripted variables are
// allowed.  For example: x_0, f_alpha.  Bolded expressions are
// changed from, e.g. 'x_0' -> 'bold_x_0'.
//
// Certain "reserved" names are changed so they don't conflict.
// For example, Gamma() is a function in Algebrite so a \Gamma
// CommandExpr is converted to 'Gamma_'.
//
// "Worst-case" variable name: 'bold_Gamma__bold_Gamma_'.
// 
// 'ignore_superscript'=true will ignore possible superscripts
// that are "in the way": x_1^y -> 'x_1'.
//
// If the Expr does not convert to a valid variable name, null
// is returned.
const reserved_algebrite_symbols =
      new Set(['Gamma', 'd']);
function expr_to_variable_name(expr, ignore_superscript=false,
                               allow_subscript=true, allow_bold=true) {
  // Prepend 'bold_' if bolded.
  if(allow_bold && expr.is_expr_type('font') && expr.is_bold &&
     (expr.typeface === 'normal' || expr.typeface === 'roman')) {
    const unbolded_name = expr_to_variable_name(
      expr.expr, ignore_superscript, allow_subscript, false);
    return unbolded_name ? ('bold_' + unbolded_name) : null;
  }

  // Remove roman font if present.
  if(expr.is_expr_type('font') && expr.typeface === 'roman')
    expr = expr.expr;

  // Check for expressions with a subscript.  Subscripted expressions
  // are converted to 'basename_subscriptname'.  Only one level of
  // subscripts is allowed (no x_a_b).
  if(allow_subscript &&
     expr.is_expr_type('subscriptsuperscript') &&
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
  if(expr.is_expr_type('text') &&
     is_valid_variable_name(expr.text, !allow_subscript)) {
    // Basic variable name like 'x'.
    // The name has to be alphanumeric, and an initial digit is disallowed
    // unless it's in the subscript (x_0 is ok but not 0_x).
    variable_name = expr.text;
  }
  else if(expr.is_expr_type('command') &&
          expr.operand_count() === 0 &&
          latex_letter_commands.has(expr.command_name)) {
    // Unary CommandExpr for things like Greek letters.
    // These are spelled out as 'alpha', etc.
    variable_name = expr.command_name;
  }
  // Make sure the text or command doesn't have an actual '_' in it.
  if(variable_name && variable_name.includes('_'))
    return null;
  // "Escape" some reserved symbols by appending an underscore.
  if(variable_name && reserved_algebrite_symbols.has(variable_name))
    variable_name += '_';
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
  if(pieces.length > 0 && pieces[0] === '') {
    // Trailing '_' (e.g. 'Gamma_').
    // If this is one of the reserved names, remove the _,
    // otherwise this is considered invalid.
    if(reserved_algebrite_symbols.has(base_name))
      pieces.shift();
    else
      return null;
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
  if(base_name === '~') {
    // Algebrite uses '~' for 'e' (natural log base).
    // Convert it to the usual roman-font 'e'.
    // NOTE: Algebrite only gives '~' as output, but doesn't accept
    // it in input: ~ is not allowed in variable names
    base_expr = new FontExpr(new TextExpr('e'), 'roman');
  }
  else if(latex_letter_commands.has(base_name))
    base_expr = new CommandExpr(base_name);  // Greek letter, etc.
  else if(base_name.length === 1)
    base_expr = new TextExpr(base_name);  // one-letter variable
  else // longer-than-one variables are rendered in Roman font
    base_expr = new FontExpr(new TextExpr(base_name), 'roman');
  if(bold)
    base_expr = base_expr.as_bold();
  // Attach the subscript if there is one.
  if(subscript_expr)
    base_expr = new SubscriptSuperscriptExpr(base_expr, subscript_expr);
  return base_expr;
}

function guess_variable_in_expr(expr) {
  let found_set = new Set();
  _guess_variable_in_expr(expr, found_set);
  if(found_set.size === 1)
    return [...found_set][0];
  else return 'x'; // maybe should return null
}
function _guess_variable_in_expr(expr, found_set) {
  const variable_name = expr_to_variable_name(expr, true);
  if(variable_name)
    found_set.add(variable_name);
  let subexpressions = null;
  if(expr.is_expr_type('function_call'))
    subexpressions = [expr.args_expr];
  else if(expr.is_expr_type('subscriptsuperscript')) {
    let scratch = [];
    if(expr.superscript_expr) scratch.push(expr.superscript_expr);
    if(!expr.subscript_expr) scratch.push(expr.base_expr);
    subexpressions = scratch;
  }
  else subexpressions = expr.subexpressions();
  subexpressions.forEach(
    subexpr => _guess_variable_in_expr(subexpr, found_set));
}


class AlgebriteInterface {
  debug_print_list(p) {
    return new AlgebriteToExpr().print_list(p);
  }
  
  expr_to_algebrite_string(expr) {
    return new ExprToAlgebrite().expr_to_algebrite_string(expr);
  }

  algebrite_node_to_expr(p) {
    return new AlgebriteToExpr().to_expr(p);
  }

  call_function(function_name, argument_exprs) {
    const argument_strings = argument_exprs.map(
      expr => new ExprToAlgebrite().expr_to_algebrite_string(expr));
    return this.call_function_with_argument_strings(
      function_name, argument_strings);
  }

  // 'argument_strings' have already been converted into Algebrite syntax.
  call_function_with_argument_strings(function_name, argument_strings) {
    console.log('Input: ' + argument_strings[0]);
    this.setup_algebrite();
    const algebrite_method = Algebrite[function_name];
    const result = algebrite_method(...argument_strings);
    console.log('Output: ' + this.debug_print_list(result));
    return result;
  }

  call_function_guessing_variable(function_name, variable_arg_index, argument_exprs) {
    const variable_name = guess_variable_in_expr(argument_exprs[0]);
    if(!variable_name) return null;
    console.log('Guessed variable: ' + variable_name);
    let argument_strings = argument_exprs.map(
      expr => new ExprToAlgebrite().expr_to_algebrite_string(expr));
    argument_strings.splice(variable_arg_index, 0, variable_name);
    return this.call_function_with_argument_strings(
      function_name, argument_strings);
  }

  // Initialize Algebrite's environment.
  setup_algebrite() {
    Algebrite.clearall();
    [ //'autoexpand = 0',
      'sec(x) = 1/cos(x)',
      'csc(x) = 1/sin(x)',
      'cot(x) = 1/tan(x)',
      'sech(x) = 1/cosh(x)',
      'csch(x) = 1/sinh(x)',
      'coth(x) = 1/tanh(x)',
      'arcsec(x) = arccos(1/x)',
      'arccsc(x) = arcsin(1/x)',
      'arccot(x) = arctan(1/x)',
      'arcsech(x) = arccosh(1/x)',
      'arccsch(x) = arcsinh(1/x)',
      'arccoth(x) = arctanh(1/x)',
      'log2(x) = log(x)/log(2)',
      'log10(x) = log(x)/log(10)',  // not yet implemented in the editor
      'negative(x) = -x',  // used for infix '-': x-y -> add(x, negative(y))
      'reciprocal(x) = 1/x'  // used for infix '/' and fractions
    ].forEach(s => Algebrite.eval(s));
  }
}


// Intermediate tree structure for converting Expr nodes into
// Alegbrite-compatible input syntax.
class AlgebriteNode {}

// '2', '(-3.4)', etc.  Must be an actual string, not a number.
// If negative, it's expected to be enclosed by parentheses.
// Usually, negative numbers will be represented as Prefix('-', '123'),
// not a literal '-123', but there are some exceptions.
// Fractions like '2/3' are also allowed here.
class AlgebriteNumber extends AlgebriteNode {
  constructor(value_string) { super(); this.value_string = value_string; }
  emit(emitter) { emitter.emit(this.value_string); }
}

// Literal variable name/symbol, as a "sanitized" string
// acceptable to Algebrite.
class AlgebriteVariable extends AlgebriteNode {
  constructor(name) { super(); this.name = name; }
  emit(emitter) { emitter.emit(this.name); }
}

// fn_name(arg1, ...)
class AlgebriteCall extends AlgebriteNode {
  constructor(fn_name, arg_nodes) {
    super();
    this.fn_name = fn_name;
    this.arg_nodes = arg_nodes;
  }

  emit(emitter) {
    emitter.emit(this.fn_name);
    emitter.emit('(');
    this.arg_nodes.forEach((node, i) => {
      if(i > 0) emitter.emit(', ');
      node.emit(emitter);
    });
    emitter.emit(')');
  }
}

// Contains a vector or matrix of other AlgebriteNodes.
// Tensor orders other than 1 and 2 are not supported.
// 'element_nodes' is a nested array-of-arrays of nodes,
// similar to what ArrayExpr has.
// If column_count=1, this is considered a vector and
// emitted as [x,y,z] rather than [[x], [y], [z]].
class AlgebriteTensor extends AlgebriteNode {
  constructor(row_count, column_count, element_nodes) {
    super();
    this.row_count = row_count;
    this.column_count = column_count;
    this.element_nodes = element_nodes;
  }

  emit(emitter) {
    const is_vector = this.column_count === 1;
    emitter.emit('[');
    for(let row = 0; row < this.row_count; row++) {
      if(!is_vector) emitter.emit('[');
      for(let column = 0; column < this.column_count; column++) {
        this.element_nodes[row][column].emit(emitter);
        if((is_vector && row < this.row_count-1) ||
           (!is_vector && column < this.column_count-1))
          emitter.emit(',');
      }
      if(!is_vector) {
        emitter.emit(']');
        if(row < this.row_count-1)
          emitter.emit(',');
      }
    }
    emitter.emit(']');
  }
}

// Small helper for converting AlgebriteNode trees to strings.
class AlgebriteEmitter {
  node_to_string(node) {
    this.pieces = [];
    node.emit(this);
    return this.pieces.join('');
  }

  emit(s) { this.pieces.push(s); }
}


class ExprToAlgebrite {
  error(message, offending_expr) {
    alert(message);
    throw new Error('Algebrite: ' + message);
  }

  expr_to_algebrite_string(expr) {
    const emitter = new AlgebriteEmitter();
    const node = this.expr_to_node(expr);
    return emitter.node_to_string(node);
  }

  expr_to_node(expr) {
    switch(expr.expr_type()) {
    case 'text': return this.text_expr_to_node(expr);
    case 'font': return this.font_expr_to_node(expr);
    case 'infix': return this.infix_expr_to_node(expr);
    case 'prefix': return this.prefix_expr_to_node(expr);
    case 'postfix': return this.postfix_expr_to_node(expr);
    case 'function_call': return this.function_call_expr_to_node(expr);
    case 'delimiter': return this.delimiter_expr_to_node(expr);
    case 'command': return this.command_expr_to_node(expr);
    case 'subscriptsuperscript': return this.subscriptsuperscript_expr_to_node(expr);
    case 'sequence': return this.sequence_expr_to_node(expr);
    case 'array': return this.array_expr_to_node(expr);
    case 'placeholder': return this.error('Placeholders not allowed', expr);
    default: return this.error('Unknown expr type: ' + expr.expr_type());
    }
  }

  text_expr_to_node(expr) {
    if(expr.looks_like_number())
      return new AlgebriteNumber(expr.text);
    const variable_name = expr_to_variable_name(expr);
    if(variable_name)
      return new AlgebriteVariable(variable_name);
    else
      return this.error('Invalid variable name', expr);
  }

  font_expr_to_node(expr) {
    const variable_name = expr_to_variable_name(expr);
    if(variable_name)
      return new AlgebriteVariable(variable_name);
    else 
      return this.expr_to_node(expr.expr);
  }

  infix_expr_to_node(infix_expr) {
    // Gather operator precedence, etc, for all infix operators, and
    // check that all are supported in Algebrite.
    const operator_infos = infix_expr.operator_exprs.map(
      operator_expr => this._infix_operator_expr_info(operator_expr) ||
        this.error('Invalid binary operator', operator_expr));
    const operand_exprs = infix_expr.operand_exprs;
    let node_stack = [this.expr_to_node(operand_exprs[0])];
    let operator_stack = [];  // stores operator info structures
    for(let i = 0; i < operator_infos.length; i++) {
      const operator_info = operator_infos[i];
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
    if(expr.is_expr_type('text'))
      op_name = expr.text;  // something like + or /
    else if(expr.is_expr_type('command') &&
            expr.operand_count() === 0)
      op_name = expr.command_name;  // times, cdot, etc
    if(op_name)
      return this._infix_op_info(op_name);
    else return null;
  }

  // Take an operator and two nodes off the stacks, combining
  // them into a AlgebriteNode that goes back on the stack.
  _resolve_infix_operator(node_stack, operator_stack) {
    const operator_info = operator_stack.pop();
    let rhs_node = node_stack.pop();
    const lhs_node = node_stack.pop();
    if(operator_info.modifier_fn)
      rhs_node = new AlgebriteCall(operator_info.modifier_fn, [rhs_node]);
    node_stack.push(new AlgebriteCall(operator_info.fn, [lhs_node, rhs_node]));
  }

  // { fn: binary algebrite function to apply
  //   modifier_fn: unary algebrite function to apply to second argument
  //                (e.g., x/y -> multiply(x, quotient(y)))
  //   prec_fn: higher numbers bind tighter }
  _infix_op_info(op_name) {
    switch(op_name) {
    case '*': return {fn:'multiply', prec:2};
    case '/': return {fn:'multiply', modifier_fn: 'reciprocal', prec:2};
    case 'times': return {fn:'cross', prec:2};
    case 'cdot': return {fn:'inner', prec:2};
    case '+': return {fn:'add', prec:1};
    case '-': return {fn:'add', modifier_fn:'negative', prec:1};
    default: return null;
    }
  }

  // Only '+' and '-' prefix operators are supported (and + is disregarded).
  prefix_expr_to_node(prefix_expr) {
    if(prefix_expr.operator_expr.is_expr_type('text')) {
      switch(prefix_expr.operator_expr.text) {
      case '-': return new AlgebriteCall(
        'negative', [this.expr_to_node(prefix_expr.base_expr)]);
      case '+': return this.expr_to_node(prefix_expr.base_expr);
      }
    }
    return this.error('Invalid prefix operator', prefix_expr);
  }
      
  // Only single-! factorial is supported.
  postfix_expr_to_node(postfix_expr) {
    const [base_expr, factorial_signs_count] = postfix_expr.analyze_factorial();
    if(factorial_signs_count === 0)
      return new AlgebriteCall('factorial', this.expr_to_node(base_expr));
    else if(factorial_signs_count > 0)
      return this.error('Multiple factorial not supported', postfix_expr);
    else
      return this.error('Invalid postfix operator', postfix_expr);
  }

  function_call_expr_to_node(expr) {
    const fn_expr = expr.fn_expr;
    const arg_exprs = expr.extract_argument_exprs();
    const arg_count = arg_exprs.length;
    if(arg_count === 0)
      return this.error('Malformed function call', expr);
    // Check for f'(x), f''(x).
    // Here, 'x' must be a simple variable name; f'(x^2) not allowed.
    const prime_count = fn_expr.is_expr_type('subscriptsuperscript') ?
          fn_expr.count_primes() : 0;
    if(arg_count === 1 && prime_count > 0 &&
       expr_to_variable_name(arg_exprs[0])) {
      // Remove one prime from the FunctionCallExpr, using that as the argument
      // to a d() call.  If there is more than one prime, this will
      // recurse until we arrive at f(x).  f''(x) -> d(d(f(x),x),x)
      return new AlgebriteCall('d', [
        this.expr_to_node(
          new FunctionCallExpr(fn_expr.remove_prime(), expr.args_expr)),
        this.expr_to_node(arg_exprs[0]) /* the differentiation variable */]);
    }
    // The usual case (not f'(x)):
    const fn_name = expr_to_variable_name(fn_expr);
    if(fn_name)
      return new AlgebriteCall(
        fn_name, arg_exprs.map(arg_expr => this.expr_to_node(arg_expr)));
    else 
      return this.error('Invalid function', expr);
  }

  // Only "standard" delimiter types can be converted to Algebrite
  // operations.  Others, like <x|, will signal an error.
  delimiter_expr_to_node(expr) {
    const [left, right] = [expr.left_type, expr.right_type];
    const inner_node = this.expr_to_node(expr.inner_expr);
    if((left === '.' && right === '.') ||
            (left === '(' && right === ')') ||
            (left === '[' && right === ']') ||
            (left === "\\{" && right === "\\}"))
      return inner_node;
    else if(left === "\\lceil" && right === "\\rceil")
      return new AlgebriteCall('ceiling', [inner_node]);
    else if(left === "\\lfloor" && right === "\\rfloor")
      return new AlgebriteCall('floor', [inner_node]);
    else if((left === "\\lVert" && right === "\\rVert") ||
            (left === "\\vert" && right === "\\vert"))
      return new AlgebriteCall('abs', [inner_node]);
    else
      return this.error('Unsupported delimiters', expr);
  }

  command_expr_to_node(expr) {
    // Some built-in commands use \operatorname{fn}{x} (a 2-argument CommandExpr).
    // These include: Tr(), sech(), csch(), which aren't present in LaTeX.
    // For these cases, the command name and argument to use are extracted
    // from the \operatorname command.
    let args, nargs, command_name;
    if(expr.command_name === 'operatorname' &&
       expr.operand_count() == 2 &&
       expr.operand_exprs[0].is_expr_type('text')) {
      args = expr.operand_exprs.slice(1);
      nargs = expr.operand_count()-1;
      command_name = expr.operand_exprs[0].text;
    }
    else {
      args = expr.operand_exprs;
      nargs = expr.operand_count();
      command_name = expr.command_name;
    }

    if(command_name === 'frac' && nargs === 2) {
      // Reuse the InfixExpr logic to convert this into a
      // node like: multiply(numer, reciprocal(denom)).
      // NOTE: if InfixExpr is ever changed to automatically merge other
      // InfixExprs into it automatically, this logic will need to be changed
      // (the full-size "fraction bar" is always the lowest possible precedence).
      return this.expr_to_node(
        new InfixExpr(expr.operand_exprs, [new TextExpr('/')]));
    }

    if(command_name === 'sqrt' && nargs === 1) {
      if(expr.options) {
        // sqrt[3], etc.
        return new AlgebriteCall(
          'power', [
            this.expr_to_node(args[0]),
            new AlgebriteNumber('1/' + expr.options)]);
      }
      else
        return new AlgebriteCall('sqrt', [this.expr_to_node(args[0])]);
    }

    // Check for unary functions like sin(x).
    // Translate 'Tr' -> 'contract', etc. as needed.
    const algebrite_command = translate_function_name(command_name, true);
    if(allowed_algebrite_unary_functions.has(algebrite_command) && nargs === 1)
      return new AlgebriteCall(algebrite_command, [this.expr_to_node(args[0])]);

    // Handle sin^2(x), etc.  These are currently implemented in rpnlatex by
    // having the command_name be a literal 'sin^2'.  This needs to be translated
    // as sin^2(x) -> sin(x)^2 for Algebrite.  Also, reciprocal trig functions
    // need to be translated as csc^2(x) -> sin(x)^(-2).
    const squared_trig_substitutions = [
      // [rpnlatex, algebrite_function, power]
      ['sin^2', 'sin', 2],       ['cos^2', 'cos', 2],       ['tan^2', 'tan', 2],
      ['sinh^2', 'sinh', 2],     ['cosh^2', 'cosh', 2],     ['tanh^2', 'tanh', 2],
      ['sec^2', 'cos', -2],      ['csc^2', 'sin', -2],      ['cot^2', 'tan', -2],
      ['sech^2', 'cosh', -2],    ['csch^2', 'sinh', -2],    ['coth^2', 'tanh', -2]
    ];
    const match = squared_trig_substitutions.find(
      pair => command_name === pair[0]);
    if(match && nargs === 1)
      return new AlgebriteCall('power', [
        new AlgebriteCall(match[1], [this.expr_to_node(args[0])]),
        new AlgebriteNumber(match[2].toString())]);

    // Zero-argument commands like \alpha are converted to their corresponding
    // alphanumeric variable name ('alpha').
    if(nargs === 0) {
      const variable_name = expr_to_variable_name(expr);
      if(variable_name)
        return new AlgebriteVariable(variable_name);
    }

    return this.error('Cannot use "' + command_name + '" here', expr);
  }

  subscriptsuperscript_expr_to_node(expr) {
    const [base_expr, subscript_expr, superscript_expr] =
          [expr.base_expr, expr.subscript_expr, expr.superscript_expr];

    // TODO: check for integrals and summations
    
    // Check for subscripted variable names (x_1).
    // A possible superscript becomes the exponent.
    if(subscript_expr) {
      const variable_name = expr_to_variable_name(expr, true /* ignore_superscript */);
      if(!variable_name)
        return this.error('Invalid variable', expr);
      if(superscript_expr)
        return new AlgebriteCall(
          'power', [
            new AlgebriteVariable(variable_name),
            this.expr_to_node(superscript_expr)]);
      else
        return new AlgebriteVariable(variable_name);
    }
    
    // Check for for "where" expressions of the form: f|_(x=y).
    if(base_expr.is_expr_type('delimiter') &&
       base_expr.left_type === '.' && base_expr.right_type === "\\vert" &&
       subscript_expr && subscript_expr.is_expr_type('infix') &&
       subscript_expr.operator_text_at(0) === '=') {
      const lhs = subscript_expr.operand_exprs[0];
      const rhs = subscript_expr.extract_side_at(0, 'right');
      return new AlgebriteCall(
        'eval', [
          this.expr_to_node(base_expr.inner_expr),
          this.expr_to_node(lhs),
          this.expr_to_node(rhs)]);
    }

    // Anything else with a subscript isn't allowed.
    if(subscript_expr)
      return this.error('Cannot use subscript here', expr);

    // Check for e^x (both roman and normal 'e').
    if(superscript_expr &&
       ((base_expr.is_expr_type('text') && base_expr.text === 'e') ||
        (base_expr.is_expr_type('font') && base_expr.typeface === 'roman' &&
         base_expr.expr.is_expr_type('text') && base_expr.expr.text === 'e')))
      return new AlgebriteCall('exp', [this.expr_to_node(superscript_expr)]);

    // x^y with no subscript on x.
    if(superscript_expr)
      return new AlgebriteCall(
        'power', [
          this.expr_to_node(base_expr),
          this.expr_to_node(superscript_expr)]);

    // Shouldn't get here.
    return this.expr_to_node(base_expr);
  }

  // NOTE: Adjacent matrix literals are converted into inner(M1, M2, ...)
  // calls here without needing an explicit \cdot.
  sequence_expr_to_node(expr) {
    const exprs = expr.exprs;
    let multiply_arg_nodes = [];  // arguments to a multiply(...) call
    for(let i = 0; i < exprs.length; i++) {
      // Look for chains of 2 or more adjacent matrices;
      // convert to inner(M1, M2, ...).
      let matrix_count = 0;
      for(let j = i; j < exprs.length &&
              exprs[j].is_expr_type('array') && exprs[j].is_matrix();
          j++, matrix_count++)
        ;
      if(matrix_count >= 2) {
        multiply_arg_nodes.push(
          new AlgebriteCall(
            'inner',
            exprs.slice(i, i+matrix_count).map(
              arg_expr => this.expr_to_node(arg_expr))));
        i += matrix_count-1;
      }
      else  // ordinary term
        multiply_arg_nodes.push(this.expr_to_node(exprs[i]));
    }
    if(multiply_arg_nodes.length === 1)  // e.g. nothing but inner(M1, M2, ...)
      return multiply_arg_nodes[0];
    else
      return new AlgebriteCall('multiply', multiply_arg_nodes);
  }

  array_expr_to_node(expr) {
    if(!expr.is_matrix())
      return this.error('Invalid matrix type', expr);
    const element_nodes = expr.element_exprs.map(row_exprs =>
      row_exprs.map(element_expr => this.expr_to_node(element_expr)));
    return new AlgebriteTensor(expr.row_count, expr.column_count, element_nodes);
  }
}


// Convert Algebrite list structures to Expr trees.
// The Algebrite Lisp-style cons lists are called 'p' here.
class AlgebriteToExpr {
  error(message, offending_p) {
    alert(message);
    throw new Error('Algebrite: ' + message);
  }
  
  // Algebrite value types.
  utype(p) {
    switch(p.k) {
    case 0: return 'cons';
    case 1: return 'num';
    case 2: return 'double';
    case 3: return 'str';
    case 4: return 'tensor';
    case 5: return 'sym';
    default: return 'unknown';
    }
  }

  is_cons(p) { return p.k === 0; }

  car(p) { return p.cons.car; }
  cdr(p) { return p.cons.cdr; }

  is_sym(p, sym_name /* optional */) {
    if(sym_name) return p.k === 5 && p.printname === sym_name;
    else return p.k === 5;
  }

  is_nil(p) { return this.is_sym(p, 'nil'); }

  to_expr(p) {
    switch(this.utype(p)) {
    case 'cons': return this.cons_to_expr(p);
    case 'num': return this.num_to_expr(p.q.a, p.q.b);
    case 'double': return this.double_to_expr(p.d);
    case 'str': return this.str_to_expr(p);
    case 'tensor': return this.tensor_to_expr(p.tensor);
    case 'sym': return this.sym_to_expr(p);
    default: return null;
    }
  }

  // Convert cons list to a flat Javascript array.
  unpack_list(p) {
    let elements = [];
    while(this.is_cons(p)) {
      elements.push(this.car(p));
      p = this.cdr(p);
    }
    return elements;
  }

  // debug utility
  print_list(p) {
    this.pieces = [];
    this._print_list(p);
    return this.pieces.join('');
  }
  _print_list(p) {
    switch(this.utype(p)) {
    case 'cons':
      this.pieces.push('(');
      for(let node = p; this.is_cons(node) && !this.is_nil(node); node = this.cdr(node)) {
        this._print_list(this.car(node));
        if(!this.is_nil(this.cdr(node)))
          this.pieces.push(' ');
      }
      this.pieces.push(')');
      break;
    case 'num': this.pieces.push(p.q.a, '/', p.q.b); break;
    case 'double': this.pieces.push(p.d); break;
    case 'str': this.pieces.push("\"", p.str, "\"");
    case 'sym': this.pieces.push(p.printname); break;
    case 'tensor': this.pieces.push('{tensor}'); break;
    default: this.pieces.push(this.utype(p)); break;
    }
  }
  
  cons_to_expr(p) {
    const head = this.car(p);
    if(this.is_sym(head))
      return this.functioncall_to_expr(head.printname, this.cdr(p));
    else
      return this.error('Unexpected Algebrite output', p);
  }

  functioncall_to_expr(f, arg_list) {
    const args = this.unpack_list(arg_list);
    const arg_exprs = args.map(arg => this.to_expr(arg));

    // Check "built-in" unary LaTeX command like \sin{x}.
    if(allowed_algebrite_unary_functions.has(f) && args.length === 1)
      return new CommandExpr(translate_function_name(f, false), [arg_exprs[0]]);

    // Check forms that have special Expr representations.
    switch(f) {
    case 'multiply':
      return this.multiply_to_expr(args);
    case 'add':
      return this.add_to_expr(args);
    case 'power':
      return this.power_to_expr(args);
    case 'derivative':
      if(args.length === 2)  // should always be true
        return this.derivative_to_expr(...args);
    case 'factorial':
      return this.factorial_to_expr(args[0]);
    case 'ceil':
      return new DelimiterExpr("\\lceil", "\\rceil", arg_exprs[0]);
    case 'floor':
      return new DelimiterExpr("\\lfloor", "\\rfloor", arg_exprs[0]);
    case 'abs':
      return new DelimiterExpr("\\vert", "\\vert", arg_exprs[0]);
    }
    
    // Anything else becomes f(x,y,z).
    let operands_expr = arg_exprs[0];
    for(let i = 1; i < args.length; i++)
      operands_expr = InfixExpr.combine_infix(
        operands_expr, arg_exprs[i], new TextExpr(','));
    return new FunctionCallExpr(
      variable_name_to_expr(f),
      DelimiterExpr.parenthesize(operands_expr));
  }

  // (add x y z ...)
  add_to_expr(terms) {
    const exprs = terms.map(term => this.to_expr(term));
    return exprs.reduce((result_expr, expr) => {
      if(expr.is_expr_type('prefix') && expr.is_unary_minus())
        return InfixExpr.combine_infix(
          result_expr, expr.base_expr, new TextExpr('-'));
      else
        return InfixExpr.combine_infix(
          result_expr, expr, new TextExpr('+'));
    });
  }

  // (multiply x y z ...)
  // Algebrite uses negative powers a lot (x^(-1) instead of 1/x),
  // so try here to convert them to more readable \frac{}{} commands instead.
  multiply_to_expr(factors) {
    let numerator_exprs = [];
    let denominator_exprs = [];
    let unary_minus = false;  // set to true if the overall sign is negative
    // Scan through all the factors, splitting them into lists of Exprs
    // for the numerator and denominator of a (potential) \frac.
    for(let i = 0; i < factors.length; i++) {
      const factor = factors[i];
      if(this.utype(factor) === 'num') {
        // Integer or rational literal factor; put the pieces into the
        // numerator and denominator lists.
        const q = factor.q;
        if(q.a.isNegative() && i == 0) {
          // A leading negative factor makes the whole fraction negated
          // (but only when it comes first in the factors list).
          unary_minus = true;
          if(!q.a.equals(-1))  // keep out unnecessary factors of 1
            numerator_exprs.push(TextExpr.integer(q.a.multiply(-1).toString()));
        }
        else if(!q.a.equals(1))
          numerator_exprs.push(TextExpr.integer(q.a.toString()));
        if(!q.b.equals(1))
          denominator_exprs.push(TextExpr.integer(q.b.toString()));
      }
      else if(this.utype(factor) === 'cons' &&
              this.utype(this.car(factor)) === 'sym' &&
              this.car(factor).printname === 'power') {
        // (power x y) subexpression
        const power_terms = this.unpack_list(this.cdr(factor));
        const [base_term, exponent_term] = power_terms;
        if(!exponent_term)  // shouldn't happen: (power x) with no 2nd arg
          numerator_exprs.push(base_term);
        else if(exponent_term && this.utype(exponent_term) === 'num') {
          // x^n or x^(n/m) term.  Negative powers go into the denominator and
          // everything else goes into the numerator.
          if(exponent_term.q.a.isNegative())
            denominator_exprs.push(
              this.power_to_expr(power_terms, true /* negate_exponent */));
          else
            numerator_exprs.push(this.power_to_expr(power_terms));
        }
        else {
          // x^y term (y not integer or rational); these always go
          // into the numerator.
          numerator_exprs.push(this.power_to_expr(power_terms));
        }
      }
      else {
        // All other kinds of factors go into the numerator.
        numerator_exprs.push(this.to_expr(factor));
      }
    }
    // All factors have been scanned; create a \frac{}{} if there is anything
    // in the denominator.
    if(denominator_exprs.length > 0) {
      // There could potentially be no terms at all in the numerator, in cases
      // like 1/x * 1/y = 1/(xy).
      if(numerator_exprs.length === 0)
        numerator_exprs.push(TextExpr.integer(1));
      const frac_expr = new CommandExpr(
        'frac', [
          this._multiply_exprs(numerator_exprs),
          this._multiply_exprs(denominator_exprs)]);
      // Finally add the overall unary minus if there is one.
      return unary_minus ? PrefixExpr.unary_minus(frac_expr) : frac_expr;
    }
    else {
      // Nothing is in the denominator, so there doesn't need to be a \frac
      // at all.  Still need to take care of the overall unary minus.
      const result_expr = this._multiply_exprs(numerator_exprs);
      return unary_minus ? PrefixExpr.unary_minus(result_expr) : result_expr;
    }
  }

  // Helper for multiply_to_expr().  Multiply all the exprs together.
  _multiply_exprs(exprs) {
    return exprs.reduce((result_expr, expr) => {
      // Integers of the form 'n' or 'n^m' (as produced by the output of
      // factor(10000) for example) need to be combined with the previous
      // term with \cdot instead of just implicit multiplication.
      const is_integer_expr =
            // n
            (expr.is_expr_type('text') && expr.looks_like_number()) ||
            // n^m
            (expr.is_expr_type('subscriptsuperscript') &&
             expr.base_expr.is_expr_type('text') && expr.base_expr.looks_like_number() &&
             expr.superscript_expr && !expr.subscript_expr &&
             expr.superscript_expr.is_expr_type('text') &&
             expr.superscript_expr.looks_like_number());
      if(is_integer_expr)
        return InfixExpr.combine_infix(
          result_expr, expr, new CommandExpr('cdot'));
      else
        return Expr.combine_pair(result_expr, expr);
    });
  }

  // negate_exponent=true turns, e.g. x^(-2) -> x^2, so that the term can
  // be put into the denominator of a larger \frac.  The exponent must be
  // integer/rational (type='num') for this to work (caller must check).
  power_to_expr(args, negate_exponent) {
    if(args.length !== 2) return null;  // shouldn't happen
    const [base_term, exponent_term] = args;
    const base_expr = this.to_expr(base_term);
    if(this.utype(exponent_term) === 'num') {
      // Rational or integer exponent.  Some special cases are checked
      // to simplify the display: x^(1/2) -> sqrt(x).
      let [numer, denom] = [exponent_term.q.a, exponent_term.q.b];
      if(negate_exponent)
        numer = numer.multiply(-1);
      // x^1 -> x (can happen if the exponent of x^(-1) is negated)
      if(numer.equals(1) && denom.equals(1))
        return base_expr;
      // x^(-1) -> 1/x
      if(numer.equals(-1) && denom.equals(1))
        return new CommandExpr('frac', [TextExpr.integer(1), base_expr]);
      // x^(-n) -> 1/(x)^n
      if(numer.isNegative() && denom.equals(1))
        return new CommandExpr('frac', [
          TextExpr.integer(1),
          SubscriptSuperscriptExpr.build_subscript_superscript(
            base_expr,
            this.num_to_expr(numer.multiply(-1), denom),
            true, /* is_superscript */
            true /* autoparenthesize */)]);
      // x^(1/2) -> sqrt(x)
      if(numer.equals(1) && denom.equals(2))
        return new CommandExpr('sqrt', [base_expr]);
      // x^(1/3) -> sqrt[3](x)
      if(numer.equals(1) && denom.equals(3))
        return new CommandExpr('sqrt', [base_expr], '3');
      // x^(-1/2) -> 1/sqrt(x)
      if(numer.equals(-1) && denom.equals(2))
        return new CommandExpr('frac', [
          TextExpr.integer(1),
          new CommandExpr('sqrt', [base_expr])]);
      // x^(-1/3) -> 1/sqrt[3](x)
      if(numer.equals(-1) && denom.equals(3))
        return new CommandExpr('frac', [
          TextExpr.integer(1),
          new CommandExpr('sqrt', [base_expr], '3')]);
      // x^n or x^(n/m)
      // For fractional n/m, render it as an inline fraction rather than using \frac.
      return SubscriptSuperscriptExpr.build_subscript_superscript(
        base_expr,
        this.num_to_expr(
          numer, denom,
          true /* inline_fraction */),
        true, /* is_superscript */
        true /* autoparenthesize */);
    }
    else {
      // x^y, x and y arbitrary.
      return SubscriptSuperscriptExpr.build_subscript_superscript(
        base_expr,
        this.to_expr(exponent_term),
        true, /* is_superscript */
        true /* autoparenthesize */);
    }
  }

  derivative_to_expr(base_p, variable_p) {
    const base_expr = this.to_expr(base_p);
    const variable_expr = this.to_expr(variable_p);

    // Try to convert forms like d(f(x), x) to f^{\prime}(x):
    //   - f has to be a simple variable name (possibly with a subscript)
    //   - f may also already be "primed", in which case another prime is added,
    //       e.g. d(d(f(x), x), x) -> f''(x)
    //   - there must only be one function argument; we can't have f'(x, y)
    //   - the argument to f must match the derivative variable
    //       e.g. not things like d(f(x^2), x)
    if(base_expr.is_expr_type('function_call') &&
       base_expr.argument_count() === 1) {
      const fn_expr = base_expr.fn_expr;
      const args_expr = base_expr.args_expr;  // the DelimiterExpr
      const variable_name = expr_to_variable_name(variable_expr);
      // Check the conditions for this notation to be used.
      // NOTE: f'(x) is assumed to be OK no matter what 'f' is, because it
      // must have come from a nested d(f(x), x) expression to begin with.
      if((expr_to_variable_name(fn_expr) ||
          (fn_expr.is_expr_type('subscriptsuperscript') && fn_expr.count_primes() > 0)) &&
         expr_to_variable_name(args_expr.inner_expr) === variable_name)
        return new FunctionCallExpr(fn_expr.with_prime(), args_expr);
    }

    // TODO: if the variable is 't', maybe use the conversion
    // d(y(t), t) ==> \dot y
    // This would need to be done in the Expr->Algebrite direction as well.

    // TODO: See if we can use partial derivative notation for things like
    // d(f(x, y), y):
    //   - f has to be a simple variable name (possibly with a subscript)
    //   - no "primes" allowed on f
    //   - the arguments to f must all be simple variable names
    //     (no f(x, y^2, z))
    //   - the derivative variable must match one of the argument variables

    // TODO: handle mixed partial derivatives too

    // Render everything else with the "default" d/dx notation.
    // NOTE: this doesn't allow for a (cosmetic) roman-font 'd'.
    const d_dx_expr = new CommandExpr(
      'frac', [
        new TextExpr('d'),
        new SequenceExpr([new TextExpr('d'), variable_expr], true)]);
    return Expr.combine_pair(d_dx_expr, base_expr);
  }

  factorial_to_expr(base_p) {
    const base_expr = this.to_expr(base_p);
    return PostfixExpr.factorial_expr(base_expr, 1);
  }

  // If 'inline_fraction' is true, it's rendered as an infix 'x/y'.
  // Otherwise, it's a full-size \frac{x}{y}.
  num_to_expr(numerator, denominator, inline_fraction) {
    const is_negative = numerator.isNegative();
    let expr = null;
    if(denominator.equals(1))
      expr = TextExpr.integer(numerator.toString());
    else if(inline_fraction) {
      expr = InfixExpr.combine_infix(
        TextExpr.integer(numerator.abs().toString()),
        TextExpr.integer(denominator.toString()),
        new TextExpr('/'));
      if(is_negative)
        expr = PrefixExpr.unary_minus(expr);
    }
    else {
      expr = new CommandExpr(
        'frac', [
          TextExpr.integer(numerator.abs().toString()),
          TextExpr.integer(denominator.toString())]);
      if(is_negative)
        expr = PrefixExpr.unary_minus(expr);
    }
    return expr;
  }

  double_to_expr(d) {
    if(d < 0.0)
      return PrefixExpr.unary_minus(new TextExpr(Math.abs(d).toString()));
    else
      return new TextExpr(d.toString());
  }

  // We don't use Algebrite strings for anything (yet).
  str_to_expr(p) {
    return this.error('Strings not allowed', p);
  }

  sym_to_expr(p) {
    const expr = variable_name_to_expr(p.printname);
    if(expr) return expr;
    else return this.error('Invalid variable name: ' + p.printname, p);
  }

  tensor_to_expr(tensor_p) {
    let row_count, column_count;
    if(tensor_p.ndim === 1) { row_count = tensor_p.dim[0]; column_count = 1; }
    else if(tensor_p.ndim === 2) { row_count = tensor_p.dim[0]; column_count = tensor_p.dim[1]; }
    else return this.error('Tensor rank too high', tensor_p);
    const row_exprs = [];
    for(let row = 0, linear_index = 0; row < row_count; row++) {
      const column_exprs = [];
      for(let column = 0; column < column_count; column++, linear_index++)
        column_exprs.push(this.to_expr(tensor_p.elem[linear_index]));
      row_exprs.push(column_exprs);
    }
    return new ArrayExpr(
      'bmatrix', row_count, column_count, row_exprs);
  }
}


export { AlgebriteInterface };

