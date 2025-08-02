

import {
  // TODO: may not need all these
  Expr, CommandExpr, FontExpr, InfixExpr, PrefixExpr, PostfixExpr,
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
  'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh',
  'arcsin', 'arccos', 'arctan', 'arcsinh', 'arccosh', 'arctanh',
  'log', 'choose', 'contract', 'det'
]);
  
// [rpnlatex_command, algebrite_command]
const algebrite_function_translations = [
  ['ln', 'log'],
  ['Tr', 'contract'],
  ['binom', 'choose'],
  ['sin^{-1}', 'arcsin'],
  ['cos^{-1}', 'arccos'],
  ['tan^{-1}', 'arctan']
];


class AlgebriteInterface {
  static translate_function_name(f, to_algebrite) {
    const match = algebrite_function_translations.find(
      pair => pair[to_algebrite ? 0 : 1] === f);
    if(match)
      return match[to_algebrite ? 1 : 0];
    else return f;
  }
  
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
    console.log('Input: ' + argument_strings[0]);
    const algebrite_method = Algebrite[function_name];
    const result = algebrite_method(...argument_strings);
    console.log('Output: ' + this.debug_print_list(result));
    return result;
  }
}


class ExprToAlgebrite {
  error(message, offending_expr) {
    alert(message);
    throw new Error('Algebrite: ' + message);
  }

  expr_to_algebrite_string(expr) {
    this.pieces = [];
    this.emit_expr(expr);
    return this.pieces.join('');
  }

  emit(s) { this.pieces.push(s); }

  emit_expr(expr) {
    switch(expr.expr_type()) {
    case 'text': this.emit_text_expr(expr); break;
    case 'infix': this.emit_infix_expr(expr); break;
    case 'prefix': this.emit_prefix_expr(expr); break;
    case 'postfix': this.emit_postfix_expr(expr); break;
    case 'delimiter': this.emit_delimiter_expr(expr); break;
    case 'command': this.emit_command_expr(expr); break;
    case 'subscriptsuperscript': this.emit_subscriptsuperscript_expr(expr); break;
    case 'sequence': this.emit_sequence_expr(expr); break;
    case 'font': this.emit_font_expr(expr); break;
    case 'array': this.emit_array_expr(expr); break;
    case 'placeholder':
      this.error('Placeholders not allowed', expr);
      break;
    default: this.error('Unknown expr type: ' + expr.expr_type());
    }
  }

  emit_parenthesized(text) {
    this.emit('(');
    this.emit(text);
    this.emit(')');
  }

  emit_parenthesized_expr(expr) {
    this.emit('(');
    this.emit_expr(expr);
    this.emit(')');
  }

  emit_function_call(function_name, argument_exprs) {
    this.emit(function_name);
    this.emit('(');
    for(let i = 0; i < argument_exprs.length; i++) {
      this.emit_expr(argument_exprs[i]);
      if(i < argument_exprs.length-1)
        this.emit(', ');
    }
    this.emit(')');
  }

  emit_text_expr(expr) {
    const text = expr.text;
    if(expr.looks_like_number() ||
       this.is_valid_variable_name(text) ||
       this.is_valid_binary_operator(text)) {
      if(expr.looks_like_negative_number())
        this.emit_parenthesized(text);
      else
        this.emit(text);
    }
    else
      this.error('Invalid text ' + text, expr);
  }

  emit_infix_expr(expr) {
    // TODO: handle \times (cross product), maybe restrict to binary infix expressions
    // (otherwise the associativity can be ambiguous).  Maybe should still handle
    // things like a + b \times c + d though.
    const [operand_exprs, operator_exprs] =
          [expr.operand_exprs, expr.operator_exprs];
    for(let i = 0; i < operator_exprs.length; i++) {
      this.emit_expr(operand_exprs[i]);
      const op = expr.operator_text_at(i);
      if(op === 'cdot' || op === 'times')
        this.emit('*');
      else if(this.is_valid_binary_operator(op))
        this.emit(op);
      else {
        // TODO: handle this better
        this.error('Invalid infix operator: ' + op);
        return;
      }
    }
    this.emit_expr(operand_exprs[operand_exprs.length-1]);
  }

  emit_prefix_expr(expr) {
    this.emit_expr(expr.operator_expr);
    this.emit_parenthesized_expr(expr.base_expr);
  }

  emit_postfix_expr(expr) {
    this.emit_parenthesized_expr(expr.base_expr);
    this.emit_expr(expr.operator_expr);
  }

  // Only "standard" delimiter types can be converted to Algebrite
  // syntax.  Others, like <x|, will signal an error.
  emit_delimiter_expr(expr) {
    const [left, right] = [expr.left_type, expr.right_type];
    const inner_expr = expr.inner_expr;
    if(left === '.' && right === '.')
      return this.emit_expr(inner_expr);
    else if((left === '(' && right === ')') ||
            (left === '[' && right === ']') ||
            (left === "\\{" && right === "\\}"))
      this.emit_parenthesized_expr(inner_expr);
    else if(left === "\\lceil" && right === "\\rceil")
      this.emit_function_call('ceil', [inner_expr]);
    else if(left === "\\lfloor" && right === "\\rfloor")
      this.emit_function_call('floor', [inner_expr]);
    else if((left === "\\lVert" && right === "\\rVert") ||
            (left === "\\vert" && right === "\\vert"))
      this.emit_function_call('abs', [inner_expr]);
    else
      this.error('Unsupported delimiters', expr);
  }

  emit_command_expr(expr) {
    let args, nargs, command_name;
    // Some built-in commands use \operatorname{fn}{x} (a 2-argument CommandExpr).
    // These include: Tr(), sech(), csch(), which aren't present in LaTeX.
    // For these cases, the command name and argument to use are extracted
    // from the \operatorname command.
    if(expr.command_name === 'operatorname' &&
       expr.operand_count() == 2 && expr.operand_exprs[0].is_expr_type('text')) {
      args = expr.operand_exprs.slice(1);
      nargs = expr.operand_count() - 1;
      command_name = expr.operand_exprs[0].text;
    }
    else {
      args = expr.operand_exprs;
      nargs = expr.operand_count();
      command_name = expr.command_name;
    }
    // Translate ln -> log, etc.
    const algebrite_command =
          AlgebriteInterface.translate_function_name(command_name, true);
    const variable_name = this.expr_as_variable_name(expr);
    if(variable_name)
      this.emit(variable_name);
    else if(command_name === 'frac' && nargs === 2) {
      this.emit_parenthesized_expr(expr.operand_exprs[0]),
      this.emit('/');
      this.emit_parenthesized_expr(expr.operand_exprs[1]);
    }
    else if(command_name === 'sqrt' && nargs === 1) {
      if(expr.options) {
        // sqrt[3], etc.
        this.emit_parenthesized_expr(args[0]);
        this.emit('^(1/' + expr.options + ')');
      }
      else
        this.emit_function_call('sqrt', args);
    }
    else if(allowed_algebrite_unary_functions.has(algebrite_command))
      this.emit_function_call(algebrite_command, args);
    else if(command_name === 'lg' || command_name === 'log_2') {
      // Special case for base-2 logarithm.  Convert to log(x)/log(2).
      // TODO: base-10 logarithms too if implemented
      this.emit('(');
      this.emit_function_call('log', args);
      this.emit('/log(2))');
    }
    else {
      // Algebrite does not have dedicated "reciprocal" trigonometric functions
      // like sec(), so render them as 1/cos() etc.
      const reciprocal_trig_substitutions = [
        ['sec', 'cos'],   ['csc', 'sin'],   ['cot', 'tan'],
        ['sech', 'cosh'], ['csch', 'sinh'], ['coth', 'tanh']
      ];
      const match = reciprocal_trig_substitutions.find(pair => command_name === pair[0]);
      if(match) {
        // sec(x) -> 1/cos(x)
        this.emit('(1/');
        this.emit_function_call(match[1], args);
        this.emit(')');
        return;
      }
      // Handle sin^2(x), etc.  These are currently implemented in rpnlatex by
      // having the command_name be a literal 'sin^2'.  This needs to be translated
      // as sin^2(x) -> sin(x)^2 for Algebrite.  Also, reciprocal trig functions
      // need to be translated as csc^2(x) -> sin(x)^(-2).
      const squared_trig_substitutions = [
        // [rpnlatex, algebrite_function, power]
        ['sin^2', 'sin', 2],       ['cos^2', 'cos', 2],       ['tan^2', 'tan', 2],
        ['sinh^2', 'sinh', 2],     ['cosh^2', 'cosh', 2],     ['tanh^2', 'tanh', 2],
        ['sec^2', 'cos', -2],      ['csc^2', 'sin', -2],      ['cot^2', 'tan', -2],
        ['sech^2', 'cosh', -2],    ['csch^2', 'sinh', -2],    ['coth^2', 'tanh', -2],
        // NOTE: (sin|cos|tan)^{-1} are handled by algebrite_function_translations
        ['sec^{-1}', 'cos', -1],   ['csc^{-1}', 'sin', -1],   ['cot^{-1}', 'tan', -1],
        ['sech^{-1}', 'cosh', -1], ['csch^{-1}', 'sinh', -1], ['coth^{-1}', 'tanh', -1]
      ];
      const match2 = squared_trig_substitutions.find(pair => command_name === pair[0]);
      if(match2) {
        this.emit_function_call(match2[1], args);
        this.emit('^');
        if(match2[2] < 0) this.emit_parenthesized(match2[2].toString());
        else this.emit(match2[2].toString());
        return;
      }
      // TODO: handle this better
      alert('Unknown command: ' + command_name);
    }
  }

  emit_subscriptsuperscript_expr(expr) {
    const [base_expr, subscript_expr, superscript_expr] =
          [expr.base_expr, expr.subscript_expr, expr.superscript_expr];

    // TODO: check for integrals, summations, 'where', etc
    
    // Check for subscripted variable names (x_1).
    if(subscript_expr) {
      if(this.try_emitting_subscripted_variable(base_expr, subscript_expr)) {
        if(superscript_expr) {
          this.emit('^');
          this.emit_parenthesized_expr(superscript_expr);
        }
        return;
      }
      // Look for "where" expressions of the form: f|_(x=y).
      if(base_expr.is_expr_type('delimiter') &&
         base_expr.left_type === '.' && base_expr.right_type === "\\vert" &&
         subscript_expr.is_expr_type('infix') && subscript_expr.operator_text_at(0) === '=') {
        const lhs = subscript_expr.operand_exprs[0];
        const rhs = subscript_expr.extract_side_at(0, 'right');
        return this.emit_function_call('eval', [base_expr.inner_expr, lhs, rhs]);
      }
      return this.error('Cannot use subscript here', expr);
    }

    // Check for e^x (both roman and normal 'e').
    if(superscript_expr &&
       ((base_expr.is_expr_type('text') && base_expr.text === 'e') ||
        (base_expr.is_expr_type('font') && base_expr.typeface === 'roman' &&
         base_expr.expr.is_expr_type('text') && base_expr.expr.text === 'e')))
      return this.emit_function_call('exp', [superscript_expr]);

    this.emit_expr(base_expr);
    if(superscript_expr) {
      this.emit('^');
      // Check if we can omit the parentheses in the exponent, for simple cases like x^2.
      if(superscript_expr.is_expr_type('text') &&
         ((superscript_expr.looks_like_number() && !superscript_expr.looks_like_negative_number()) ||
          this.expr_as_variable_name(superscript_expr) !== null))
        this.emit_expr(superscript_expr);
      else
        this.emit_parenthesized_expr(superscript_expr);
    }
  }

  try_emitting_subscripted_variable(base_expr, subscript_expr) {
    // Expressions with subscripts have to be "simple" variable names
    // such as x_1.  Things like (x+y)_1 are not allowed.
    const base_name = this.expr_as_variable_name(base_expr);
    const subscript_name = this.expr_as_variable_name(subscript_expr, true);
    if(base_name && subscript_name) {
      const final_name = [base_name, subscript_name].join('_');
      if(this.is_valid_variable_name(final_name)) {
        this.emit(final_name);
        return true;
      }
      else {
        this.error('Invalid subscript', subscript_expr);
        return false;
      }
    }
    return false;
  }

  emit_sequence_expr(expr) {
    const exprs = expr.exprs;
    for(let i = 0; i < exprs.length; i++) {
      // Put a '*' between most terms, assuming it's implicit multiplication.
      // Exceptions:
      //   - Unary plus or minus at the beginning of the sequence (PrefixExpr)
      //   - Fused length-2 sequence of something plus a DelimiterExpr
      //     (so that we get f(x) and not f*(x)).
      let implicit_multiplication = i < exprs.length-1;
      if(i === 0 &&
         exprs[i].is_expr_type('prefix') &&
         ['-', '+'].includes(exprs[i].operator_text()))
        implicit_multiplication = false;  // unary +/-
      if(expr.fused && exprs.length === 2 && exprs[1].is_expr_type('delimiter'))
        implicit_multiplication = false;  // f(x)
      this.emit_expr(exprs[i]);
      if(implicit_multiplication)
        this.emit('*');
    }
  }

  emit_font_expr(expr) {
    // TODO: for now, just strip font stuff
    return this.emit_expr(expr.expr);
  }

  emit_array_expr(expr) {
    if(!expr.is_matrix())
      return this.error('Invalid matrix type', expr);
    const matrix_expr = expr;
    const [row_count, column_count] = [matrix_expr.row_count, matrix_expr.column_count];
    // 1xN or Nx1 matrices are passed as vectors to Algebrite
    // with only a single bracket pair, e.g. [x,y,z].
    const is_vector = column_count === 1 || row_count === 1;
    this.emit('[');
    for(let row = 0; row < row_count; row++) {
      if(!is_vector) this.emit('[');
      for(let column = 0; column < column_count; column++) {
        const element_expr = matrix_expr.element_exprs[row][column];
        this.emit_expr(element_expr);
        if((is_vector && !(row == row_count-1 && column == column_count-1)) ||
           (!is_vector && column < column_count-1))
          this.emit(',');
      }
      if(!is_vector) {
        this.emit(']');
        if(row < row_count-1)
          this.emit(',');
      }
    }
    this.emit(']');
  }

  // Check if a variable name is acceptable by Algebrite.
  is_valid_variable_name(s, allow_initial_digit) {
    const regex = allow_initial_digit ?
          /^[a-zA-Z0-9]+$/g /* NOTE: disallow _ in this case */ :
          /^[a-zA-Z][a-zA-Z0-9_]*$/g;
    return s.match(regex) != null;
  }

  // Check for "special character" operators like + that can be passed
  // directly to Algebrite.
  is_valid_binary_operator(s) {
    return ['+', '-', '/', '=', '<', '>', ',', '!'].includes(s);
  }

  // allow_initial_digit is for permitting things like '1' for subscripted
  // variables like x_1.
  expr_as_variable_name(expr, allow_initial_digit) {
    if(expr.is_expr_type('text') &&
       this.is_valid_variable_name(expr.text, allow_initial_digit))
      return expr.text;
    else if(expr.is_expr_type('command') &&
            expr.operand_count() === 0 &&
            latex_letter_commands.has(expr.command_name))
      return expr.command_name;  // Greek letters, etc.
    else
      return null;
  }
}


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
    case 'sym': return this.sym_to_expr(p.printname);
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
      return new TextExpr('(???)');  // shouldn't happen
  }

  functioncall_to_expr(f, arg_list) {
    const args = this.unpack_list(arg_list);
    const arg_exprs = args.map(arg => this.to_expr(arg));
    if(f === 'multiply')
      return this.multiply_to_expr(args);
    else if(f === 'add')
      return this.add_to_expr(args);
    else if(f === 'power')
      return this.power_to_expr(args);
    else if(f === 'derivative' && args.length === 2)
      return this.derivative_to_expr(...args);
    else if(f === 'factorial')
      return this.factorial_to_expr(args[0]);
    else if(f === 'ceil')
      return new DelimiterExpr("\\lceil", "\\rceil", arg_exprs[0]);
    else if(f === 'floor')
      return new DelimiterExpr("\\lfloor", "\\rfloor", arg_exprs[0]);
    else if(f === 'abs')
      return new DelimiterExpr("\\vert", "\\vert", arg_exprs[0]);
    else if(allowed_algebrite_unary_functions.has(f) && args.length === 1) {
      // "Built-in" unary LaTeX command like \sin{x}.
      return new CommandExpr(
        AlgebriteInterface.translate_function_name(f, false),
        [arg_exprs[0]]);
    }
    else {
      // Anything else becomes f(x,y,z).
      let operands_expr = arg_exprs[0];
      for(let i = 1; i < args.length; i++)
        operands_expr = InfixExpr.combine_infix(
          operands_expr, arg_exprs[i], new TextExpr(','));
      return new SequenceExpr(
        [ this.sym_to_expr(f),
          DelimiterExpr.parenthesize(operands_expr)
        ], true /* fuse operator and arguments */);
    }
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
            numerator_exprs.push(new TextExpr(q.a.multiply(-1).toString()));
        }
        else if(!q.a.equals(1))
          numerator_exprs.push(new TextExpr(q.a.toString()));
        if(!q.b.equals(1))
          denominator_exprs.push(new TextExpr(q.b.toString()));
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
      // like 1/x * 1/y * 1/z = 1/(xyz).
      if(numerator_exprs.length === 0)
        numerator_exprs.push(new TextExpr('1'));
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
    if(args.length !== 2) return null;
    const [base_term, exponent_term] = args;
    const base_expr = this.to_expr(base_term);
    if(this.utype(exponent_term) === 'num') {
      // Rational or integer exponent.  Some special cases are checked
      // to simplify the display (e.g. x^(1/2) -> sqrt(x)).
      let [exponent_numerator, exponent_denominator] =
          [exponent_term.q.a, exponent_term.q.b];
      if(negate_exponent)
        exponent_numerator = exponent_numerator.multiply(-1);
      // x^1 -> x (can happen if the exponent of x^(-1) is negated)
      if(exponent_numerator.equals(1) && exponent_denominator.equals(1))
        return base_expr;
      // x^(-1) -> 1/x
      if(exponent_numerator.equals(-1) && exponent_denominator.equals(1))
        return new CommandExpr('frac', [new TextExpr('1'), base_expr]);
      // x^(-n) -> 1/(x)^n
      if(exponent_numerator.isNegative() && exponent_denominator.equals(1))
        return new CommandExpr('frac', [
          new TextExpr('1'),
          SubscriptSuperscriptExpr.build_subscript_superscript(
            base_expr,
            this.num_to_expr(exponent_numerator.multiply(-1), exponent_denominator),
            true, /* is_superscript */
            true /* autoparenthesize */)]);
      // x^(1/2) -> sqrt(x)
      if(exponent_numerator.equals(1) && exponent_denominator.equals(2))
        return new CommandExpr('sqrt', [base_expr]);
      // x^(1/3) -> sqrt[3](x)
      if(exponent_numerator.equals(1) && exponent_denominator.equals(3))
        return new CommandExpr('sqrt', [base_expr], '3');
      // x^(-1/2) -> 1/sqrt(x)
      if(exponent_numerator.equals(-1) && exponent_denominator.equals(2))
        return new CommandExpr('frac', [
          new TextExpr('1'),
          new CommandExpr('sqrt', [base_expr])]);
      // x^(-1/3) -> 1/sqrt[3](x)
      if(exponent_numerator.equals(-1) && exponent_denominator.equals(3))
        return new CommandExpr('frac', [
          new TextExpr('1'),
          new CommandExpr('sqrt', [base_expr], '3')]);
      // x^n or x^(n/m)
      // For fractional n/m, render it as an inline fraction rather than using \frac.
      return SubscriptSuperscriptExpr.build_subscript_superscript(
        base_expr,
        this.num_to_expr(
          exponent_numerator,
          exponent_denominator,
          true /* inline_fraction */),
        true, /* is_superscript */
        true /* autoparenthesize */);
    }
    else {
      // x^y, x and y arbitrary
      return SubscriptSuperscriptExpr.build_subscript_superscript(
        base_expr,
        this.to_expr(exponent_term),
        true, /* is_superscript */
        true /* autoparenthesize */);
    }
  }

  derivative_to_expr(base_p, variable_p) {
    // TODO: recognize special forms like derivative(f(x), x)  -> f'(x)
    //       or df/dx (instead of d/dx f), if f is simple enough
    const base_expr = this.to_expr(base_p);
    const variable_expr = this.to_expr(variable_p);
    const d_dx_expr = new CommandExpr(
      'frac', [
        new TextExpr('d'),
        new SequenceExpr([new TextExpr('d'), variable_expr])]);
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
    if(is_negative) numerator = numerator.multiply(-1);
    let expr = null;
    if(denominator.equals(1))  // integer
      expr = new TextExpr(numerator.toString());
    else if(inline_fraction) {
      expr = InfixExpr.combine_infix(
        new TextExpr(numerator.toString()),
        new TextExpr(denominator.toString()),
        new TextExpr('/'));
      if(is_negative)
        expr = PrefixExpr.unary_minus(expr);
    }
    else {
      expr = new CommandExpr(
        'frac', [
          new TextExpr(numerator.toString()),
          new TextExpr(denominator.toString())]);
      if(is_negative)
        expr = PrefixExpr.unary_minus(expr);
    }
    return expr;
  }

  double_to_expr(d) {
    return new TextExpr(d.toString());
  }

  str_to_expr(p) {
    return new TextExpr("\"" + p.str + "\"");
  }

  // NOTE: s is a string, not the original 'sym' list.
  sym_to_expr(s) {
    if(s === '~') {
      // Algebrite uses '~' for 'e' (natural log base).
      // Convert it to the usual roman-font 'e'.
      return new FontExpr(new TextExpr('e'), 'roman');
    }
    // Check for variable name; handle Greek letters and subscripts (_).
    const result = s.match(/^([a-zA-Z][a-zA-Z0-9]*)(_[a-zA-Z0-9]+)?$/);
    if(result) {
      const base_str = result[1];
      const subscript_str = result[2] ? result[2].slice(1) : null;  // remove _
      const _convert = str => {
        if(latex_letter_commands.has(str))
          return new CommandExpr(str);  // Greek letter
        else if(str.length === 1)
          return new TextExpr(str);  // one-letter variable
        else  // longer-than-one variables are rendered in Roman font
          return new FontExpr(new TextExpr(str), 'roman');
      };
      if(subscript_str)
        return new SubscriptSuperscriptExpr(
          _convert(base_str), _convert(subscript_str));
      else
        return _convert(base_str);
    }
    else {
      // Other symbol formats shouldn't really happen in practice,
      // but render them as roman text if they do.  The text needs
      // to be sanitized to avoid LaTeX control characters.
      return new FontExpr(
        new TextExpr(LatexEmitter.latex_escape(s)),
        'roman');
    }
  }

  tensor_to_expr(tensor) {
    let row_count, column_count;
    if(tensor.ndim === 1) { row_count = tensor.dim[0]; column_count = 1; }
    else if(tensor.ndim === 2) { row_count = tensor.dim[0]; column_count = tensor.dim[1]; }
    else return this.error('Tensor rank too high', p);
    const row_exprs = [];
    for(let row = 0, linear_index = 0; row < row_count; row++) {
      const column_exprs = [];
      for(let column = 0; column < column_count; column++, linear_index++) {
        const expr = this.to_expr(tensor.elem[linear_index]);
        column_exprs.push(expr);
      }
      row_exprs.push(column_exprs);
    }
    return new ArrayExpr('bmatrix', row_count, column_count, row_exprs);
  }
}


export { AlgebriteInterface };

