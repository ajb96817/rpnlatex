
// Interface to Algebrite: http://algebrite.org/
//
// Algebrite uses Lisp-like data structures internally, so most of the code
// here is involved with converting expressions between it and the editor.
//
// - Conversion of Expr structures into Algebrite's input syntax is handled
//   by ExprToAlgebrite.  Expr trees are turned into an intermediate tree
//   of AlgebriteNode objects and from there generate nested function calls
//   like x^2+3 -> 'add(power(x, 2), 3)'.  Since everything is function calls,
//   the Algebrite infix math syntax is hardly used.
//
// - Algebrite returns list structures that are converted back into
//   Expr nodes by AlgebriteToExpr.  The Expr results are reformatted
//   appropriately to improve readability: f'(x) instead of d(f(x), x),
//   \sqrt{x} instead of x^(1/2), etc.
//
// - Since Algebrite only accepts alphanumeric symbol names, things like
//   Greek letters, subscripted variables, and bold symbols have to be
//   translated back and forth.  For example Expr(\alpha_0) becomes
//   'alpha_0' in Algebrite, a FontExpr(x, bold=true) becomes 'bold_x', etc.
//
// - The overall exposed interface to this is in AlgebriteInterface.


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
  'arg', 'erf', 'erfc', 'real', 'imag',
  
  // Custom functions added to Algebrite by rpnlatex:
  'sec', 'csc', 'cot', 'sech', 'csch', 'coth',
  'arcsec', 'arccsc', 'arccot', 'arcsech', 'arccsch', 'arccoth',
  'log2', 'log10',

  // Custom functions for handling - and /:
  'negative', 'reciprocal'
]);

// Translations between internal command names and Algebrite functions.
// [rpnlatex_command, algebrite_function]
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
  ['Tr', 'contract'  /* TODO: 'trace' instead */],
  ['Re', 'real'],
  ['Im', 'imag'],
  ['ln', 'log'],
  ['log_2', 'log2'],
  ['lg', 'log2'],
  ['log_{10}', 'log10']  // not yet implemented in the editor
];

// 'to_algebrite'=true converts from editor commands to Algebrite
// (e.g. binom->choose); false is the inverse.
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
// allowed.  For example: x_0, f_alpha.  Bolded variables are
// handled as, e.g. 'x_0' -> 'bold_x_0'.
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

  // Remove (ignore) roman font if present.
  // Other fonts like sans-serif are considered unconvertable.
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
    // it in input: ~ is not allowed in variable names.
    base_expr = new FontExpr(new TextExpr('e'), 'roman');
  }
  else if(latex_letter_commands.has(base_name))
    base_expr = new CommandExpr(base_name);  // Greek letter, etc.
  else if(base_name.length === 1)
    base_expr = new TextExpr(base_name);  // one-letter variable
  else  // longer-than-one variables are rendered in roman font
    base_expr = new FontExpr(new TextExpr(base_name), 'roman');
  if(bold)
    base_expr = base_expr.as_bold();
  // Attach the subscript if there is one.
  if(subscript_expr)
    base_expr = new SubscriptSuperscriptExpr(base_expr, subscript_expr);
  return base_expr;
}


// Scan an expression and try to find the variable to use for the
// "implicit variable" for Algebrite commands like [#][d] (derivative).
// Returns [variable_name_string, variable_expr].
// If no variable is found, or if there's more than one like in
// sin(x*y) and therefore ambiguous, returns [null, null].
function guess_variable_in_expr(expr) {
  const var_map = {};
  _guess_variable_in_expr(expr, var_map);
  const var_names = Object.getOwnPropertyNames(var_map);
  if(var_names.length === 1)
    return [var_names[0], var_map[var_names[0]]];
  else
    return [null, null];
}
function _guess_variable_in_expr(expr, var_map) {
  const variable_name = expr_to_variable_name(expr, true);
  if(variable_name)
    var_map[variable_name] = expr;
  // We don't necessarily want to look for variables in every possible
  // subexpression; for example with x_a, the variable should be x_a as
  // a whole, even though it has the subexpressions 'x' and 'a'.
  let subexpressions = [];
  if(expr.is_expr_type('function_call'))
    subexpressions.push(expr.args_expr);  // don't look at the function name itself
  else if(expr.is_expr_type('subscriptsuperscript')) {
    // Never recurse into subscripts, and if there is a subscript, don't
    // recurse into the base expression itself.  Always check superscripts though.
    if(expr.superscript_expr)
      subexpressions.push(expr.superscript_expr);
    if(!expr.subscript_expr)
      subexpressions.push(expr.base_expr);
  }
  else if(expr.is_expr_type('infix'))
    subexpressions = expr.operand_exprs;  // don't look at the operators, only operands
  else if(expr.is_expr_type('font')) {
    // Don't look inside FontExprs; if it's \bold{x} we want 'bold_x',
    // not the 'x' inside.  This will miss variables inside things like
    // a bolded (x+y), however.
  }
  else
    subexpressions = expr.subexpressions();
  subexpressions.forEach(
    subexpr => _guess_variable_in_expr(subexpr, var_map));
}


// Number formatting routines.
// Algebrite numbers are either rationals (type=NUM) with BigInt
// numerator and denominator, or else double precision floats
// (type=DOUBLE).

function format_bigint(x) {
  // Use scientific notation for large integers.
  if(x.abs().greater(1e12))
    return format_double(x.toJSNumber());
  else
    return x.toString();
}

function format_double(x) { return x.toString(); }

// Convert an Algebrite rational to a corresponding Expr.
// Note that 'numerator' and 'denominator' are BigInt values here.
// If 'inline_fraction' is true, it's rendered as an infix 'x/y'.
// Otherwise, it's a full-size \frac{x}{y}.
function rational_to_expr(numerator, denominator, inline_fraction) {
  if(denominator.equals(1))
    return bigint_to_expr(numerator);
  const js_value = numerator.toJSNumber() / denominator.toJSNumber();
  if(Math.abs(js_value) > 1e12)
    return double_to_scientific_notation_expr(js_value);
  let expr = null;
  if(inline_fraction)
    expr = InfixExpr.combine_infix(
      bigint_to_expr(numerator.abs()),
      bigint_to_expr(denominator),
      new TextExpr('/'));
  else
    expr = new CommandExpr(
      'frac', [
        bigint_to_expr(numerator.abs()),
        bigint_to_expr(denominator)]);
  return numerator.isNegative() ?
    PrefixExpr.unary_minus(expr) : expr;
}

function bigint_to_expr(x) {
  if(x.compareAbs(1e12) > 0)
    return double_to_scientific_notation_expr(x.toJSNumber());
  const expr = TextExpr.integer(format_bigint(x.abs()));
  if(x.isNegative())
    return PrefixExpr.unary_minus(expr);
  else return expr;
}

function double_to_expr(x) {
  if(isNaN(x))
    return FontExpr.roman_text('NaN');
  else if(isFinite(x)) {
    const abs_x = Math.abs(x);
    if(abs_x < 1e-30)
      return new TextExpr('0.0');
    if(abs_x < 1e-8 || abs_x > 1e9)
      return double_to_scientific_notation_expr(x);
    else {
      // Here, x is known to have a "reasonable" exponent so
      // that toString() will not output scientific notation.
      const expr = new TextExpr(abs_x.toString());
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
  const exp_string = x.toExponential();  // "3e+4", or else "Infinity", "NaN", etc.
  // Split on e+ and e- both explicitly, in case e.g. "Infinity" happened to have an "e" in it.
  const [pieces_positive, pieces_negative] =
        [exp_string.split('e+'), exp_string.split('e-')];
  const [coefficient_text, exponent_text, exponent_is_negative] =
        pieces_positive.length === 2 ?
        [...pieces_positive, false] : [...pieces_negative, true];
  const coefficient_is_negative = coefficient_text.startsWith('-');
  let coefficient_expr = new TextExpr(
    coefficient_is_negative ? coefficient_text.slice(1) : coefficient_text);
  if(coefficient_is_negative)
    coefficient_expr = PrefixExpr.unary_minus(coefficient_expr);
  let exponent_expr = new TextExpr(exponent_text);
  if(exponent_is_negative)
    exponent_expr = PrefixExpr.unary_minus(exponent_expr);
  return InfixExpr.combine_infix(
    coefficient_expr,
    new SubscriptSuperscriptExpr(
      TextExpr.integer(10), null, exponent_expr),
    new CommandExpr('cdot'));
}


// This class is the only thing exported from this module.
class AlgebriteInterface {
  static debug_print_list(p) {
    return new AlgebriteToExpr().print_list(p);
  }

  // Returns:
  //    [string, null, null] - successful conversion
  //    [null, error_message, offending_subexpr] - on failure
  static expr_to_algebrite_string(expr) {
    let result = null;
    try {
      const result_string = new ExprToAlgebrite().expr_to_algebrite_string(expr);
      result = [result_string, null, null];
    } catch(e) {
      if(e instanceof ExprToAlgebriteError)
        result = [null, e.message, e.offending_expr];
      else
        result = [null, e.message, expr];
    }
    return result;
  }

  static algebrite_node_to_expr(p) {
    return new AlgebriteToExpr().to_expr(p);
  }

  static call_function(function_name, argument_exprs) {
    const argument_strings = argument_exprs.map(
      expr => new ExprToAlgebrite().expr_to_algebrite_string(expr));
    return this.call_function_with_argument_strings(
      function_name, argument_strings);
  }

  // 'argument_strings' have already been converted into Algebrite syntax.
  static call_function_with_argument_strings(function_name, argument_strings) {
    console.log('Input: ' + argument_strings[0]);
    const algebrite_method = Algebrite[function_name];
    const result = algebrite_method(...argument_strings);
    console.log('Output: ' + this.debug_print_list(result));
    return result;
  }

  static guess_variable(expr) {
    return guess_variable_in_expr(expr);
  }

  // Check a relational expression like 'x=y' for truth.
  // The relational operator can be one of: =, !=, <, >, <=, >=.
  // This check "symbolically" first using the Algebrite
  // testxx(eq) functions, then falls back to sampling points
  // in a given range and evaluating numerically.
  //
  // Currently, the variable to test is "guessed" from the equation.
  //
  // 'params': {
  //   'time_limit': stop checking after this many milliseconds
  //   'iteration_limit': stop checking after this many evaluations
  //   'lower_bound', 'upper_bound': check variable values within this range
  // }
  //
  // Returns: {
  //   'result': 'True', 'Probably true', 'False',
  //             'Inconclusive' (e.g. if time ran out)
  //   'message': optional message to display about the results
  //   'exact': true if the relation could be checked symbolically,
  //            false if we had to resort to a numerical check
  //   'tries': number of numerical evaluations that were attempted
  //   'variable': the Expr that was used as the independent variable,
  //               if available
  //   'false_for': the value of the independent variable for which the
  //                equation was found to be false
  // }
  static check_relation(expr, params) {
    this.setup_algebrite();
    const scratch = this.analyze_relation(expr);
    if(!scratch)
      return {
        'result': 'Inconclusive',
        'message': 'No relational operator',
        'exact': true
      };
    const [lhs_expr, rhs_expr, relation_type] = scratch;
    // Try checking "symbolically" with Algebrite.
    // It will return 1 or 0 for true/false, otherwise the result
    // will just be a "testeq(...)" call.
    const result = this.call_function(
      // NOTE: there is no 'testneq()' function in Algebrite, so negate the
      // result of testeq() instead as a hack.
      relation_type === 'testneq' ? 'testeq' : relation_type,
      [lhs_expr, rhs_expr]);
    if(result.k === 1 /* NUM */) {
      let is_true = null;
      if(result.q.a.equals(1) && result.q.b.equals(1))
        is_true = true;
      else if(result.q.a.equals(0))
        is_true = false;
      if(relation_type === 'testneq')
        is_true = !is_true;
      return {
        'result': is_true ? 'True' : 'False',
        'exact': true
      };
    }
    // Symbolic check failed.  Test it out numerically instead.
    const [variable_name, variable_expr] = guess_variable_in_expr(expr);
    if(!variable_name)
      return {
        'result': 'Inconclusive',
        'message': 'Could not determine variable',
        'exact': true
      };
    return this.check_relation_numerically(
      lhs_expr, rhs_expr,
      variable_name, variable_expr,
      relation_type, params);
  }

  // Check for an equation like x^2 = sin(x).
  // Return [left_expr, right_expr, relation_type] if found;
  // relation_type is an Algebrite test function name.
  // Return null if the expression is not an equation
  // (or has multiple relational operators).
  static analyze_relation(expr) {
    if(!expr.is_expr_type('infix'))
      return null;
    const relation_types = {
      '=':  'testeq',
      '<':  'testlt',
      '>':  'testgt',
      'ne': 'testneq',  // special case
      'le': 'testle',
      'ge': 'testge'
    };
    // Scan for a relational operator in the infix expression.
    let relation_index = null;
    let relation_type = null;
    expr.operator_exprs.forEach((operator_expr, i) => {
      const operator_text = expr.operator_text_at(i);
      if(relation_types[operator_text]) {
        if(relation_type)
          return null;  // more than 1 relational operator
        relation_type = relation_types[operator_text];
        relation_index = i;
      }
    });
    if(relation_index === null)
      return null;  // no relational operator
    return [
      expr.extract_side_at(relation_index, 'left'),
      expr.extract_side_at(relation_index, 'right'),
      relation_type];
  }

  static check_relation_numerically(lhs_expr, rhs_expr, variable_name, variable_expr, relation_type, params) {
    // Set up function definitions for efficiency.
    this.define_function('lhs_expr', variable_name, lhs_expr);
    this.define_function('rhs_expr', variable_name, rhs_expr);
    const start_time = Date.now();
    let iter = 0;
    while(iter < params.iteration_limit &&
          Date.now() - start_time < params.time_limit) {
      iter++;
      // Sample 'x' uniformly within the given bounds.
      const variable_value = params.lower_bound +
            Math.random()*(params.upper_bound - params.lower_bound);
      const variable_value_string = variable_value.toString();
      const result = this._check_relation_numerically_once(
        variable_name, variable_value_string, relation_type);
      if(result === null) {
        // Could not evaluate.
        return {
          'result': 'Inconclusive',
          'message': 'Could not evaluate numerically',
          'exact': false,
          'tries': iter,
          'variable': variable_expr
        };
      }
      else if(result === false) {
        return {
          'result': 'False',
          'exact': false,
          'tries': iter,
          'variable': variable_expr,
          'false_for': variable_value
        };
      }
    }
    return {
      'result': 'Probably true',
      'exact': false,
      'tries': iter,
      'variable': variable_expr
    };
  }

  static _check_relation_numerically_once(variable_name, variable_value_string, relation_type) {
    const lhs_result = Algebrite.eval(
      ['float(lhs_expr(', variable_name, '))'].join(''),
      variable_name, variable_value_string);
    const rhs_result = Algebrite.eval(
      ['float(rhs_expr(', variable_name, '))'].join(''),
      variable_name, variable_value_string);
    if(lhs_result.k === 2 /* DOUBLE */ && rhs_result.k === 2) {
      const lhs_float = lhs_result.d;
      const rhs_float = rhs_result.d;
      // console.log('lhs=' + lhs_float + ' rhs=' + rhs_float);
      if(this._check_numerical_relation_result(lhs_result.d, rhs_result.d, relation_type))
        return relation_type === 'testneq' ? false : true;
    }
    return relation_type === 'testneq' ? true : false;
  }

  static _check_numerical_relation_result(lhs, rhs, relation_type) {
    switch(relation_type) {
    case 'testeq': return this.approx_equal(lhs, rhs);
    case 'testneq': return !this.approx_equal(lhs, rhs);
    case 'testlt': return lhs < rhs;
    case 'testle': return lhs <= rhs;
    case 'testgt': return lhs > rhs;
    case 'testge': return lhs >= rhs;
    default: return false;
    }
  }

  static approx_equal(x, y) {
    return Math.abs(x-y) <= 1e-7;
  }

  static define_function(fn_name, variable_name, body_expr) {
    const body_result = this.expr_to_algebrite_string(body_expr);
    if(!body_result[0]) {
      // TODO
      alert('define_function failed');
      return;
    }
    const def_string = [
      fn_name,
      '(', variable_name, ') = ',
      body_result[0]
    ].join('');
    Algebrite.run(def_string);
  }

  // Initialize Algebrite's environment.
  static setup_algebrite() {
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
      'reciprocal(x) = 1/x',  // used for infix '/' and fractions
      'testneq(x) = not(testeq(x))'  // to support checking x \neq y equations
    ].forEach(s => Algebrite.eval(s) /* TODO: .run() */);
  }
}


// Intermediate tree structure for converting Expr nodes into
// Alegbrite-compatible input syntax.
class AlgebriteNode {}

// '2', '(-3.4)', etc.  Must be an actual string, not a number.
// If negative, it's expected to be enclosed by parentheses.
// Usually, negative numbers will be represented as Prefix('-', '123'),
// not a literal '-123', but there are some exceptions.
// Fractions like '2/3' are also allowed here, and scientific notation
// like '2.4e-17'.
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
// Even things like addition and multiplication use this.
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


class ExprToAlgebriteError extends Error {
  constructor(message, offending_expr) {
    super(message);
    this.offending_expr = offending_expr;
  }
}


class ExprToAlgebrite {
  error(message, offending_expr) {
    throw new ExprToAlgebriteError(message, offending_expr);
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
    // If this is a valid bolded variable name, use that, otherwise
    // ignore the font and convert the base expression.
    const variable_name = expr_to_variable_name(expr);
    if(variable_name)
      return new AlgebriteVariable(variable_name);
    else 
      return this.expr_to_node(expr.expr);
  }

  // InfixExprs are flat lists of operators and operands, so we have
  // to "parse" the terms and take into account operator precedence.
  // (x+y*z -> x+(y*z)).
  infix_expr_to_node(infix_expr) {
    // Gather operator precedence, etc, for all infix operators, and
    // check that all are supported in Algebrite.
    const operator_infos = infix_expr.operator_exprs.map(
      operator_expr => this._infix_operator_expr_info(operator_expr) ||
        this.error('Invalid binary operator', operator_expr));
    const operand_exprs = infix_expr.operand_exprs;
    const node_stack = [this.expr_to_node(operand_exprs[0])];
    const operator_stack = [];  // stores operator info structures
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
    if(factorial_signs_count === 1)
      return new AlgebriteCall('factorial', [this.expr_to_node(base_expr)]);
    else if(factorial_signs_count > 1)
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
    const variable_expr = arg_exprs[0];
    // Check for f'(x), f''(x).
    // Here, 'x' must be a simple variable name; f'(x^2) not allowed.
    const prime_count = fn_expr.is_expr_type('subscriptsuperscript') ?
          fn_expr.count_primes() : 0;
    if(arg_count === 1 && prime_count > 0 &&
       expr_to_variable_name(variable_expr)) {
      // Remove one prime from the FunctionCallExpr, using that as the argument
      // to a d() call.  If there is more than one prime, this will
      // recurse until we arrive at f(x).  f''(x) -> d(d(f(x),x),x)
      return new AlgebriteCall('d', [
        this.expr_to_node(
          new FunctionCallExpr(fn_expr.remove_prime(), expr.args_expr)),
        this.expr_to_node(variable_expr)]);
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
    // These include: Tr(), sech(), csch(), erf(), erfc(), which aren't present in LaTeX.
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

    if(command_name === 'frac' && nargs === 2)
      return new AlgebriteCall(
        'multiply', [
          this.expr_to_node(args[0]),
          new AlgebriteCall('reciprocal', [this.expr_to_node(args[1])])]);

    if(command_name === 'sqrt' && nargs === 1) {
      if(expr.options) {
        // sqrt[3], etc.  The option is assumed to be valid (positive integer).
        return new AlgebriteCall(
          'power', [
            this.expr_to_node(args[0]),
            new AlgebriteNumber('1/' + expr.options)]);
      }
      else
        return new AlgebriteCall('sqrt', [this.expr_to_node(args[0])]);
    }

    // Check for unary functions like sin(x).
    // Translate 'Tr' -> 'contract', etc. if needed.
    const algebrite_command = translate_function_name(command_name, true);
    if(allowed_algebrite_unary_functions.has(algebrite_command) && nargs === 1)
      return new AlgebriteCall(algebrite_command, [this.expr_to_node(args[0])]);

    // Special case for \binom{n}{m}; this is the only two-argument
    // function used with Algebrite.
    if(command_name === 'binom' && nargs === 2)
      return new AlgebriteCall('choose', [
        this.expr_to_node(args[0]), this.expr_to_node(args[1])]);

    // Handle sin^2(x), etc.  These are currently implemented in rpnlatex by
    // having the command_name be a literal 'sin^2'.  This needs to be translated
    // as sin^2(x) -> sin(x)^2 for Algebrite.  Also, reciprocal trig functions
    // need to be translated as csc^2(x) -> sin(x)^(-2).
    const match = [
      // [rpnlatex, algebrite_function, power]
      ['sin^2', 'sin', 2],    ['cos^2', 'cos', 2],    ['tan^2', 'tan', 2],
      ['sinh^2', 'sinh', 2],  ['cosh^2', 'cosh', 2],  ['tanh^2', 'tanh', 2],
      ['sec^2', 'cos', -2],   ['csc^2', 'sin', -2],   ['cot^2', 'tan', -2],
      ['sech^2', 'cosh', -2], ['csch^2', 'sinh', -2], ['coth^2', 'tanh', -2]
    ].find(pair => command_name === pair[0]);
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
    
    // Check for for "where" expressions of the form: f|_{x=y}.
    if(base_expr.is_expr_type('delimiter') &&
       base_expr.left_type === '.' && base_expr.right_type === "\\vert" &&
       subscript_expr && subscript_expr.is_expr_type('infix') &&
       subscript_expr.operator_text_at(0) === '=') {
      if(superscript_expr)
        return this.error('Cannot use superscript here', expr);
      const lhs = subscript_expr.operand_exprs[0];
      const rhs = subscript_expr.extract_side_at(0, 'right');
      return new AlgebriteCall(
        'eval', [
          this.expr_to_node(base_expr.inner_expr),
          this.expr_to_node(lhs),
          this.expr_to_node(rhs)]);
    }

    // Check for subscripted variable names (x_1).
    // A possible superscript becomes the exponent.
    if(subscript_expr) {
      const variable_name = expr_to_variable_name(expr, true /* ignore_superscript */);
      if(!variable_name)
        return this.error('Invalid variable subscript', expr);
      if(superscript_expr)
        return new AlgebriteCall(
          'power', [
            new AlgebriteVariable(variable_name),
            this.expr_to_node(superscript_expr)]);
      else
        return new AlgebriteVariable(variable_name);
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

  // SequenceExprs are assumed to be implicit multiplications.
  // Adjacent matrix literals are converted into inner(M1, M2, ...)
  // calls here without needing an explicit \cdot.
  sequence_expr_to_node(expr) {
    const exprs = expr.exprs;
    const term_nodes = [];  // arguments to a multiply(...) call
    for(let i = 0; i < exprs.length; i++) {
      // Look for chains of 2 or more adjacent matrices;
      // convert to inner(M1, M2, ...).
      let matrix_count = 0;
      for(let j = i; j < exprs.length &&
              exprs[j].is_expr_type('array') && exprs[j].is_matrix();
          j++, matrix_count++)
        ;
      if(matrix_count >= 2) {
        term_nodes.push(
          new AlgebriteCall(
            'inner',
            exprs.slice(i, i+matrix_count).map(
              arg_expr => this.expr_to_node(arg_expr))));
        i += matrix_count-1;
      }
      else  // ordinary term
        term_nodes.push(this.expr_to_node(exprs[i]));
    }
    if(term_nodes.length === 1)  // e.g. nothing but inner(M1, M2, ...)
      return term_nodes[0];
    else
      return new AlgebriteCall('multiply', term_nodes);
  }

  array_expr_to_node(expr) {
    if(!expr.is_matrix())
      return this.error('Invalid matrix type', expr);
    const element_nodes = expr.element_exprs.map(row_exprs =>
      row_exprs.map(element_expr => this.expr_to_node(element_expr)));
    if(expr.row_count === 1 && expr.column_count === 1) {
      // Decay 1x1 matrices into a scalar.
      // This is to help avoid an Algebrite bug with inverting
      // 1x1 symbolic matrices.
      return element_nodes[0][0];
    }
    return new AlgebriteTensor(
      expr.row_count, expr.column_count, element_nodes);
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

  // Convert cons list to a flat Javascript array.
  unpack_list(p) {
    let elements = [];
    while(this.is_cons(p)) {
      elements.push(this.car(p));
      p = this.cdr(p);
    }
    return elements;
  }

  // Debug utility: cons list to string.
  print_list(p) {
    this.pieces = [];
    this._print_list(p);
    const result = this.pieces.join('');
    this.pieces = null;
    return result;
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
    case 'num': this.pieces.push(format_bigint(p.q.a), '/', format_bigint(p.q.b)); break;
    case 'double': this.pieces.push(format_double(p.d)); break;
    case 'str': this.pieces.push("\"", p.str, "\"");
    case 'sym': this.pieces.push(p.printname); break;
    case 'tensor': this.pieces.push('{tensor}'); break;
    default: this.pieces.push(this.utype(p)); break;
    }
  }

  to_expr(p) {
    switch(this.utype(p)) {
    case 'cons': return this.cons_to_expr(p);
    case 'num': return rational_to_expr(p.q.a, p.q.b);
    case 'double': return double_to_expr(p.d);
    case 'str': return this.str_to_expr(p);
    case 'tensor': return this.tensor_to_expr(p.tensor);
    case 'sym': return this.sym_to_expr(p);
    default: return null;
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
    const nargs = args.length;
    const arg_exprs = args.map(arg => this.to_expr(arg));

    // Check "built-in" unary LaTeX command like \sin{x}.
    if(allowed_algebrite_unary_functions.has(f) && args.length === 1)
      return new CommandExpr(
        translate_function_name(f, false),
        [DelimiterExpr.parenthesize_for_argument(arg_exprs[0])]);

    // Check forms that have special Expr representations.
    switch(f) {
    case 'multiply':
      return this.multiply_to_expr(args);
    case 'add':
      return this.add_to_expr(args);
    case 'power':
      return this.power_to_expr(args);
    case 'derivative':
      if(nargs === 2)
        return this.derivative_to_expr(...args);
    case 'factorial':
      if(nargs === 1)
        return this.factorial_to_expr(args[0]);
    case 'ceil':
      if(nargs === 1)
        return new DelimiterExpr("\\lceil", "\\rceil", arg_exprs[0]);
    case 'floor':
      if(nargs === 1)
        return new DelimiterExpr("\\lfloor", "\\rfloor", arg_exprs[0]);
    case 'abs':
      if(nargs === 1)
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
      else if(expr.is_expr_type('sequence') &&
              expr.exprs[0].is_expr_type('prefix') &&
              expr.exprs[0].is_unary_minus()) {
        // e.g. add(x, -4y); the -4y is a SequenceExpr[PrefixExpr[-, 4], y]
        const new_sequence_expr = new SequenceExpr(
          [expr.exprs[0].base_expr, ...expr.exprs.slice(1)]);
        return InfixExpr.combine_infix(
          result_expr, new_sequence_expr, new TextExpr('-'));
      }
      else
        return InfixExpr.combine_infix(
          result_expr, expr, new TextExpr('+'));
    });
  }

  // (multiply x y z ...)
  // Algebrite uses negative powers a lot (x^(-1) instead of 1/x),
  // so try here to convert them to more readable \frac{}{} commands.
  multiply_to_expr(factors) {
    const numerator_exprs = [];
    const denominator_exprs = [];
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
            numerator_exprs.push(bigint_to_expr(q.a.multiply(-1)));
        }
        else if(!q.a.equals(1))
          numerator_exprs.push(bigint_to_expr(q.a));
        if(!q.b.equals(1))
          denominator_exprs.push(bigint_to_expr(q.b));
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
          // x^n or x^(n/m) term.  Negative powers go into the denominator,
          // positive goes into the numerator.
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
            rational_to_expr(numer.multiply(-1), denom),
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
        rational_to_expr(numer, denom, true /* inline_fraction */),
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

