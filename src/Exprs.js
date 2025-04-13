
import {
  LatexEmitter, SpecialFunctions
} from './Models';


// Abstract superclass for expression trees.
class Expr {
  static from_json(json) {
    switch(json.expr_type) {
    case 'command':
      return new CommandExpr(
        json.command_name,
        this._list(json.operand_exprs),
        json.options);
    case 'font':
      return new FontExpr(
	this._expr(json.expr),
	json.typeface,
	json.is_bold,
	json.size_adjustment);
    case 'infix':
      return new InfixExpr(
        this._list(json.operand_exprs),
        this._list(json.operator_exprs),
        json.split_at_index,
        json.linebreaks_at || []);
    case 'postfix':
      return new PostfixExpr(
	this._expr(json.base_expr),
	this._expr(json.operator_expr));
    case 'placeholder':
      return new PlaceholderExpr();
    case 'text':
      return new TextExpr(json.text);
    case 'sequence':
      return new SequenceExpr(
        this._list(json.exprs),
        !!json.fused);
    case 'delimiter':
      return new DelimiterExpr(
        json.left_type,
        json.right_type,
        this._expr(json.inner_expr),
        json.fixed_size);
    case 'subscriptsuperscript':
      return new SubscriptSuperscriptExpr(
        this._expr(json.base_expr),
        this._expr(json.subscript_expr),
        this._expr(json.superscript_expr));
    case 'array':
      return new ArrayExpr(
        json.array_type,
        json.row_count,
        json.column_count,
        this._list2d(json.element_exprs),
        json.row_separators,
        json.column_separators);
    default:
      return new TextExpr('invalid expr type ' + json.expr_type);
    }
  }

  // Helper routines for from_json
  static _expr(json) { return json ? Expr.from_json(json) : null; }
  static _list(json_array) { return json_array.map(expr_json => Expr.from_json(expr_json)); }
  static _list2d(json_array) { return json_array.map(row_exprs => Expr._list(row_exprs)); }
  
  // Concatenate two Exprs into one.  This will merge Exprs into adjacent SequenceExprs
  // when possible, instead of creating nested SequenceExprs.
  // The 'fused' flag of SequenceExprs can be used to prohibit combining this way.
  // InfixExprs are always parenthesized before being combined here unless
  // no_parenthesize=true is passed.
  static combine_pair(left, right, no_parenthesize) {
    const left_type = left.expr_type(), right_type = right.expr_type();
    const autoparenthesize = expr => {
      // Parenthesize InfixExprs before combining unless specified not to.
      if(expr.is_expr_type('infix') && !no_parenthesize)
        return DelimiterExpr.parenthesize(expr);
      else return expr;
    };

    // Handle concatenating an expression to one or more ! signs, for factorial notation.
    // This notation has to be handled carefully:
    //   - The usual case is concatenating a base expression 'x' to a ! sign,
    //     yielding a PostfixExpr(x, '!').
    //   - Concatenating ! to ! should give a Sequence['!', '!'].
    //   - Concatenating a non-'!' expression to such a sequence should yield
    //     the double-factorial x!!, which is a nested PostfixExpr.
    //   - Any amount of ! symbols can be used, although only x! and x!! have meaning here.
    const excl_count = expr => {
      // Count number of exclamation points, for both TextExprs and SequenceExprs.
      if(expr.is_expr_type('text') && expr.text === '!')
	return 1;
      else if(expr.is_expr_type('sequence') &&
	      expr.exprs.every(subexpr => subexpr.is_expr_type('text') &&
			       subexpr.text === '!'))
	return expr.exprs.length;
      else
	return 0;
    };
    const left_excl_count = excl_count(left);
    const right_excl_count = excl_count(right);
    if(right_excl_count > 0) {
      if(left_excl_count === 0) {
	// Concatenating a "normal" expression to 1 or more ! signs.
	return PostfixExpr.factorial_expr(
	  autoparenthesize(left), right_excl_count);
      }
      else {
	// Concatenating groups (1 or more) of ! signs together.
	return new SequenceExpr(
	  new Array(left_excl_count + right_excl_count).fill(new TextExpr('!')));
      }
    }
    // Sequence + Sequence
    if(left_type === 'sequence' && !left.fused && right_type === 'sequence' && !right.fused)
      return new SequenceExpr(left.exprs.concat(right.exprs));
    // Sequence + NonSequence
    if(left_type === 'sequence' && !left.fused && right_type !== 'sequence')
      return new SequenceExpr(left.exprs.concat([autoparenthesize(right)]));
    // NonSequence + Sequence
    if(right_type === 'sequence' && !right.fused && left_type !== 'sequence')
      return new SequenceExpr([autoparenthesize(left)].concat(right.exprs));
    // Some types of Command can be combined in special ways
    if(left_type === 'command' && right_type === 'command')
      return Expr.combine_command_pair(left, right);
    // Special case: combine 123 456 => 123456 if both sides are numeric.
    // This can lead to things like "1.2" + "3.4" -> "1.23.4" but that's
    // considered OK because the main use for this is to build numbers from
    // individual digits.  The user should use an explicit \cdot or \times
    // infix operator to indicate multiplication.
    if(left_type === 'text' && left.looks_like_number() &&
       right_type === 'text' && right.looks_like_number())
      return new TextExpr(left.text + right.text);
    // NonSequence + NonSequence => Sequence
    // Adjacent FontExprs of the same type can be merged into a single
    // FontExpr instead, e.g. \bold{AB} instead of \bold{A}\bold{B}
    // (This renders better in some cases.)
    // Note that applying a font after expressions are concatenated
    // will not do this merging.  AB -> bold -> \bold{A}\bold{B}.
    // This could be implemented if needed (by coalescing adjacent FontExprs
    // within a SequenceExpr).
    const left_expr = autoparenthesize(left);
    const right_expr = autoparenthesize(right);
    if(left_expr.is_expr_type('font') && right_expr.is_expr_type('font') &&
       FontExpr.font_exprs_compatible(left_expr, right_expr))
      return new FontExpr(
        new SequenceExpr([left_expr.expr, right_expr.expr]),
        left_expr.typeface, left_expr.is_bold, left_expr.size_adjustment);
    else
      return new SequenceExpr([left_expr, right_expr]);
  }

  // Combine two CommandExprs with some special-casing for some particular command pairs.
  static combine_command_pair(left, right) {
    const left_name = left.command_name, right_name = right.command_name;

    // Try combining adjacent integral symbols into multiple-integral commands.
    let new_command_name = null;
    if(left_name === 'int' && right_name === 'int') new_command_name = 'iint';
    if(left_name === 'iint' && right_name === 'int') new_command_name = 'iiint';
    if(left_name === 'int' && right_name === 'iint') new_command_name = 'iiint';
    if(left_name === 'oint' && right_name === 'oint') new_command_name = 'oiint';
    if(left_name === 'oiint' && right_name === 'oint') new_command_name = 'oiiint';
    if(left_name === 'oint' && right_name === 'oiint') new_command_name = 'oiiint';
    if(new_command_name)
      return new CommandExpr(new_command_name);

    // Everything else just becomes a SequenceExpr.
    return new SequenceExpr([left, right]);
  }

  // Combine two Exprs with the given conjunction phrase between them, with largish spacing.
  // For example "X  iff  Y" as in the [,][F] command.
  // is_bold will make the conjunction phrase bolded.
  static combine_with_conjunction(left, right, phrase, is_bold) {
    const conjunction_expr = new SequenceExpr([
      new CommandExpr('quad'),
      new CommandExpr(
        is_bold ? 'textbf' : 'text',
        [new TextExpr(phrase)]),
      new CommandExpr('quad')]);
    return InfixExpr.combine_infix(left, right, conjunction_expr);
  }

  // Convert a string into a TextExpr, or a CommandExpr if it begins
  // with \ (i.e. a latex command).
  static text_or_command(s) {
    if(s.startsWith("\\"))
      return new CommandExpr(s.slice(1));
    else
      return new TextExpr(s);
  }
  
  expr_type() { return '???'; }

  is_expr_type(s) { return s === this.expr_type(); }

  to_latex(selected_expr_path) {
    let emitter = new LatexEmitter(this, selected_expr_path);
    emitter.expr(this, null);
    return emitter.finished_string();
  }

  emit_latex(emitter) { emitter.text('INVALID'); }

  // Return a list of property names on this object that should be serialized.
  json_keys() { return []; }

  // Subclasses can extend this if they need special handling.
  to_json() {
    let json = { expr_type: this.expr_type() };
    this.json_keys().forEach(json_key => {
      const obj = this[json_key];
      let value;
      if(obj === null || obj === undefined)
        value = null;
      else if(typeof(obj) === 'object' && obj instanceof Expr)
        value = obj.to_json();
      else if(typeof(obj) === 'object') {
        // Assume it's an Array.  It could also be a 2-dimensional array, in which case the subclasses
        // need to extend to_json() instead of relying on this default.
        value = obj.map(elt => elt.to_json());
      }
      else // Strings, numbers, etc.
        value = obj;
      json[json_key] = value;
    });
    return json;
  }

  to_text() { return "$$\n" + this.to_latex() + "\n$$"; }

  // If this expression can be 'unparsed' for editing in the minieditor, return
  // the editable string.  Return null if not possible.
  // This is the 'inverse' of ExprParser.parse_string().
  as_editable_string() { return null; }

  // Invoke fn once for each subexpression in this expression tree (including 'this').
  // The visiting is performed depth-first, left-to-right, so should correspond visually
  // to the left-to-right rendering of the expression.
  visit(fn) { fn(this); }

  // Return a list of all immediate subexpressions of this one, in (at least approximate)
  // left-to-right order.
  subexpressions() { return []; }

  // True if this has any subexpressions to descend into via ExprPath.
  // As a special case, FontExprs that represent font commands peek into
  // their arguments (recursively) to determine this.  This is to prevent
  // selecting "inside" font commands that only wrap a simple leaf expression.
  // This means that has_subexpressions() may sometimes return false even
  // if subexpressions() is nonempty.
  has_subexpressions() { return this.subexpressions().length > 0; }

  // Return a new Expr like this one but with the subexpression at the given index replaced
  // with a new one.  The subexpression indexes here correspond to what is returned by subexpressions().
  replace_subexpression(index, new_expr) { return this; }

  // Find the first PlaceholderExpr that exists in this expression.  Returns null if none.
  find_placeholder() {
    let found = null;
    this.visit(expr => {
      if(expr.is_expr_type('placeholder') && !found)
        found = expr;
    });
    return found;
  }

  // Return a (possibly) new Expr with new_expr substituted for old_expr, if old_expr is present.
  substitute_expr(old_expr, new_expr) {
    if(this === old_expr)
      return new_expr;
    else
      return this;
  }

  // Attempt to evaluate this Expr numerically, returning a floating-point value.
  // Return null if evaluation is not possible; subclasses can override.
  // The evaluation might raise errors, so the caller should use an exception handler.
  //
  // 'assignments' is a key-value table mapping variable names to (floating-point) values to
  // substitute in this expression.  Using this can allow things like sin(x) to be evaluated.
  // Aside from any assignments, everything else in the expression must be constants, or
  // combinations/functions of constants.
  evaluate(assignments) { return null; }

  // Attempt to evaluate this Expr numerically.
  // Returns: [expr, exact_flag] or null on failure,
  // where 'expr' is an Expr representing the result, and 'exact_flag'
  // is true if the result can be considered "exact".
  // rationalize=true here attempts to pull out factors of common
  // values like sqrt(2) or pi.  These will be multiplied into the output
  // if found.  Rationalize=false always returns a decimal TextExpr.
  // TODO: exception handler around evaluate()
  evaluate_to_expr(assignments, rationalize) {
    const value = this.evaluate(assignments);
    if(value === null) return null;
    if(rationalize) {
      const result = this.rationalize_to_expr(value);
      if(result)
        return [result, true];
    }
    // Return an approximate floating-point value instead.
    // It's considered "exact" if it's small enough in magnitude and
    // with a decimal part close enough to zero.
    const is_exact = Math.abs(value) < 1e9 && Math.abs(value % 1.0) <= 1e-6
    return [this._float_to_expr(value), is_exact];
  }

  // "Dissolve" this expression into its component parts as appropriate.
  // Returns an array of the Expr components.
  dissolve() { return [this]; }

  // Subclasses can override.
  as_bold() {
    return FontExpr.wrap(this).with_bold(true).unwrap_if_possible();
  }

  // Try to find a close rational approximation to value
  // or up to a factor of some common constants like sqrt(2) or pi.
  // Return an Expr if successful, otherwise null.
  rationalize_to_expr(value) {
    let result = null;
    const make_text = n => this._int_to_expr(n);
    const make_sqrt = expr => new CommandExpr('sqrt', [expr]);
    const pi_expr = new CommandExpr('pi');
    const two_pi_expr = Expr.combine_pair(make_text(2), pi_expr);
    // Don't try to rationalize anything too large in magnitude.
    if(Math.abs(value) > 1e8)
      return null;
    // Check for very small fractional part; could be either an integer,
    // or a float with large magnitude and thus decayed fractional precision.
    if(Math.abs(value % 1.0) < 0.000001)
      return this._int_to_expr(value);
    // Try different variations on \pi
    // NOTE: pi is a little weird because a close rational approximation 
    // (335/113) both has small denominator and is very close to the actual
    // value of pi.  So the epsilon value in _try_rationalize_with_factor()
    // needs to be chosen carefully.
    result = this._try_rationalize_with_factor(  // pi^2
      value, Math.PI*Math.PI,
      new SubscriptSuperscriptExpr(
        pi_expr, null, make_text(2)), null);
    result ||= this._try_rationalize_with_factor(  // pi
      value, Math.PI, pi_expr, null);
    result ||= this._try_rationalize_with_factor(  // 1/pi
      value, 1/Math.PI, null, pi_expr);
    result ||= this._try_rationalize_with_factor(  // sqrt(pi)
      value, Math.sqrt(Math.PI), make_sqrt(pi_expr), null);
    result ||= this._try_rationalize_with_factor(  // 1 / \sqrt(pi)
      value, 1/Math.sqrt(Math.PI), null, make_sqrt(pi_expr));
    result ||= this._try_rationalize_with_factor(  // \sqrt(2pi)
      value, Math.sqrt(2*Math.PI), make_sqrt(two_pi_expr), null);
    result ||= this._try_rationalize_with_factor(  // 1 / \sqrt(2pi)
      value, 1/Math.sqrt(2*Math.PI), null, make_sqrt(two_pi_expr));
    // Check factors of ln(2)
    result ||= this._try_rationalize_with_factor(
      value, Math.log(2), new CommandExpr('ln', [make_text(2)]), null);
    // Try sqrt(n) in the numerator for small square-free n.
    // No need to check denominators since, e.g. 1/sqrt(3) = sqrt(3)/3
    const small_squarefree = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19];
    for(let i = 0; i < small_squarefree.length; i++)
      result ||= this._try_rationalize_with_factor(
        value, Math.sqrt(small_squarefree[i]),
        make_sqrt(make_text(small_squarefree[i])), null);
    // Try golden ratio-like factors
    result ||= this._try_rationalize_with_factor(
      value, 1+Math.sqrt(5),
      new InfixExpr([make_text(1), make_sqrt(make_text(5))], [new TextExpr('+')]),
      null);
    result ||= this._try_rationalize_with_factor(
      value, Math.sqrt(5)-1,  // NOTE: keep positive sign, 1-sqrt(5) is negative
      new InfixExpr([make_sqrt(make_text(5)), make_text(1)], [new TextExpr('-')]),
      null);
    // NOTE: factors of e^n (n!=0) are rare in isolation so don't test for them here.
    // Finally, rationalize the number itself with no factors
    result ||= this._try_rationalize_with_factor(value, 1.0, null, null);
    return result;
  }

  // Helper for rationalize_to_expr().
  // Try to pull out rational multiples of 'factor' using Farey fractions.
  // If successful, return the factored rational expression,
  // multiplied by 'numer_factor_expr' in the numerator or
  // 'denom_factor_expr' in the denominator if they are given.
  // If no rationalization close enough can be found, return null.
  _try_rationalize_with_factor(value, factor, numer_factor_expr, denom_factor_expr) {
    const x = value / factor;
    const max_denom = 500;  // maximum denominator tolerated
    const epsilon = 0.00000001;  // maximum deviation from true value tolerated
    const sign = Math.sign(value);
    const x_abs = Math.abs(x);
    const [integer_part, fractional_part] = [Math.floor(x_abs), x_abs % 1.0];
    const [numer, denom] = this._rationalize(fractional_part, max_denom);
    const rationalized_value = numer/denom;
    if(Math.abs(rationalized_value - fractional_part) < epsilon) {
      // This is a close enough rational approximation that it can be considered exact.
      const final_numer = integer_part*denom + numer;
      const final_denom = denom;
      let final_expr = null;
      if(final_denom === 1) {
        // Integer multiple of the factor.
        const base_expr = this._int_to_expr(final_numer*sign);
        if(numer_factor_expr) {
          if(final_numer === 1) {
            if(sign < 0)
              final_expr = Expr.combine_pair(new TextExpr('-'), numer_factor_expr);
            else
              final_expr = numer_factor_expr;
          }
          else
            final_expr = Expr.combine_pair(base_expr, numer_factor_expr);
        }
        else if(denom_factor_expr)
          final_expr = CommandExpr.frac(base_expr, denom_factor_expr);
        else
          final_expr = base_expr;
      }
      else {
        // Rational (but not integer) multiple of the factor.
        let numer_expr = this._int_to_expr(final_numer);
        if(numer_factor_expr) {
          if(final_numer === 1)
            numer_expr = numer_factor_expr;
          else
            numer_expr = Expr.combine_pair(numer_expr, numer_factor_expr);
        }
        let denom_expr = this._int_to_expr(final_denom);
        if(denom_factor_expr)
          denom_expr = Expr.combine_pair(denom_expr, denom_factor_expr);
        let frac_expr = CommandExpr.frac(numer_expr, denom_expr);
        if(sign < 0)
          final_expr = Expr.combine_pair(new TextExpr('-'), frac_expr);
        else final_expr = frac_expr;
      }
      return final_expr;
    }
    else
      return null;  // not close enough to a rational multiple of factor
  }

  // Farey fraction algorithm.  Find closest rational approximation to
  // 0 <= x <= 1, with maximum denominator max_denom.
  // Returns [numerator, denominator].
  _rationalize(x, max_denom) {
    let [a, b, c, d] = [0, 1, 1, 1];
    while(b <= max_denom && d <= max_denom) {
      const mediant = (a+c) / (b+d);
      if(x === mediant) {
        if(b + d <= max_denom)
          return [a+c, b+d];
        else if(d > b)
          return [c, d];
        else
          return [a, b];
      }
      else if(x > mediant)
        [a, b] = [a+c, b+d];
      else
        [c, d] = [a+c, b+d];
    }
    if(b > max_denom)
      return [c, d];
    else
      return [a, b];
  }

  // Number formatting routines.
  // If we "know" x should be an integer (e.g. as part of a rationalized fraction),
  // try to show it without any decimal part with _int_to_expr.
  // Very large or small-but-nonzero values are shown in scientific notation.

  _int_to_expr(x) {
    if(isNaN(x))
      return FontExpr.roman_text('NaN');
    else if(Math.abs(x) > 1e12)
      return this._float_to_expr(x);  // use scientific notation
    else
      return new TextExpr(Math.round(x).toString());
  }

  _float_to_expr(x) {
    if(isNaN(x))
      return FontExpr.roman_text('NaN');
    else if(isFinite(x)) {
      const abs_x = Math.abs(x);
      if(abs_x < 1e-30)
	return new TextExpr('0.0');
      if(abs_x < 1e-8 || abs_x > 1e9)
	return this._float_to_scientific_notation_expr(x);
      else {
	// Here, x is known to have a "reasonable" exponent so
	// that toString() will not output scientific notation.
	return new TextExpr(x.toString());
      }
    }
    else {
      const infty_expr = new CommandExpr('infty');
      if(x > 0)
	return infty_expr;
      else  // create 'fused' -\infty sequence
	return new SequenceExpr([new TextExpr('-'), infty_expr], true);
    }
  }

  _float_to_scientific_notation_expr(x) {
    const exp_string = x.toExponential();  // "3e+4", or else "Infinity", "NaN", etc.
    // Split on e+ and e- both explicitly, in case e.g. "Infinity" happened to have an "e" in it.
    const pieces_positive = exp_string.split('e+');
    const pieces_negative = exp_string.split('e-');
    let coefficient_text = null;
    let exponent_text = null;
    if(pieces_positive.length === 2)
      [coefficient_text, exponent_text] = pieces_positive;
    else if(pieces_negative.length === 2) {
      coefficient_text = pieces_negative[0];
      exponent_text = '-' + pieces_negative[1];
    }
    else
      return new TextExpr('???');  // Infinity, NaN, etc.; shouldn't happen by this point
    return InfixExpr.combine_infix(
      new TextExpr(coefficient_text),
      new SubscriptSuperscriptExpr(
	new TextExpr('10'), null, new TextExpr(exponent_text)),
      new CommandExpr('times'));
  }
}


// Represents a "raw" LaTeX command such as \sqrt plus optional operand expressions.
class CommandExpr extends Expr {
  static frac(numer_expr, denom_expr) {
    return new CommandExpr(
      'frac',
      [numer_expr, denom_expr]);
  }
  
  // NOTES:
  //   - 'command_name' does not include the initial \ character
  //   - 'options', if provided, is a plain string that becomes "\command_name[options]{...}"
  //   - 'command_name' itself can include the options in [brackets], in which case it is
  //     automatically split off into 'options' (this is used for keybindings).
  //     (e.g.: command_name='sqrt[3]' -> command_name='sqrt', options='3')
  constructor(command_name, operand_exprs, options) {
    super();
    if(command_name.endsWith(']')) {
      const index = command_name.indexOf('[');
      this.command_name = command_name.slice(0, index);
      this.options = command_name.slice(index+1, command_name.length-1);
    }
    else {
      this.command_name = command_name;
      this.options = options === undefined ? null : options;
    }
    this.operand_exprs = operand_exprs || [];
  }

  operand_count() { return this.operand_exprs.length; }
  expr_type() { return 'command'; }
  json_keys() { return ['command_name', 'operand_exprs', 'options']; }

  emit_latex(emitter) {
    if(this.command_name !== '')
      emitter.command(this.command_name, this.options);
    // Braces need to be forced around each operand, even single-letter operands.
    this.operand_exprs.forEach((operand_expr, index) =>
      emitter.grouped_expr(operand_expr, 'force', index));
  }

  visit(fn) {
    fn(this);
    this.operand_exprs.forEach(operand_expr => operand_expr.visit(fn));
  }

  subexpressions() { return this.operand_exprs; }

  replace_subexpression(index, new_expr) {
    return new CommandExpr(
      this.command_name,
      this.operand_exprs.map(
        (operand_expr, op_index) => op_index === index ? new_expr : operand_expr),
      this.options);
  }

  substitute_expr(old_expr, new_expr) {
    if(this === old_expr) return new_expr;
    return new CommandExpr(
      this.command_name,
      this.operand_exprs.map(
        operand_expr => operand_expr.substitute_expr(old_expr, new_expr)),
      this.options);
  }

  evaluate(assignments) {
    const c = this.command_name;
    // NOTE: 'sech' and 'csch' are special cases (along with their inverse and squared variants);
    // see do_named_function().  These are wrapped in \operatorname{sech}{...} commands.
    // Check for these cases and synthesize a "fake" CommandExpr temporarily for the evaluation.
    if(c === 'operatorname' &&
       this.operand_count() === 2 &&
       this.operand_exprs[0].is_expr_type('text')) {
      const funcname = this.operand_exprs[0].text;
      const arg_expr = this.operand_exprs[1];
      const fake_command = new CommandExpr(funcname, [arg_expr]);
      return fake_command.evaluate(assignments);
    }
    if(this.operand_count() === 0) {
      // Check for "greek" letters in assignments.
      const assigned_val = assignments[c];
      if(assigned_val !== undefined && assigned_val !== null)
	return assigned_val;
      if(c === 'pi') return Math.PI;
      if(c === 'infty') return Infinity;
    }
    if(this.operand_count() === 1) {
      // Unary functions
      const x = this.operand_exprs[0].evaluate(assignments);
      if(x === null) return null;
      if(c === 'sin') return Math.sin(x);
      if(c === 'cos') return Math.cos(x);
      if(c === 'sec') return 1/Math.cos(x);
      if(c === 'csc') return 1/Math.sin(x);
      if(c === 'tan') return Math.tan(x);
      if(c === 'cot') return 1/Math.tan(x);
      if(c === 'sinh') return Math.sinh(x);
      if(c === 'cosh') return Math.cosh(x);
      if(c === 'sech') return 1/Math.cosh(x);
      if(c === 'csch') return 1/Math.sinh(x);
      if(c === 'tanh') return Math.tanh(x);
      if(c === 'coth') return 1/Math.tanh(x);
      if(c === 'sqrt') {
        if(this.options === '3')
          return Math.cbrt(x);
        else if(this.options)
          return null;  // anything other than sqrt and cbrt unsupported
        else
          return Math.sqrt(x);
      }
      // Hacky inverse and squared trig functions.  See Actions.js do_named_function().
      if(c === 'sin^{-1}') return Math.asin(x);
      if(c === 'cos^{-1}') return Math.acos(x);
      if(c === 'sec^{-1}') return Math.acos(1/x);
      if(c === 'csc^{-1}') return Math.asin(1/x);
      if(c === 'tan^{-1}') return Math.atan(x);
      if(c === 'cot^{-1}') return Math.atan(1/x);
      if(c === 'sinh^{-1}') return Math.asinh(x);
      if(c === 'cosh^{-1}') return Math.acosh(x);
      if(c === 'sech^{-1}') return Math.acosh(1/x);
      if(c === 'csch^{-1}') return Math.asinh(1/x);
      if(c === 'tanh^{-1}') return Math.atanh(x);
      if(c === 'coth^{-1}') return Math.atanh(1/x);
      if(c === 'sin^2') return Math.pow(Math.sin(x), 2);
      if(c === 'cos^2') return Math.pow(Math.cos(x), 2);
      if(c === 'sec^2') return Math.pow(Math.cos(x), -2);
      if(c === 'csc^2') return Math.pow(Math.sin(x), -2);
      if(c === 'tan^2') return Math.pow(Math.tan(x), 2);
      if(c === 'cot^2') return Math.pow(Math.tan(x), -2);
      if(c === 'sinh^2') return Math.pow(Math.sinh(x), 2);
      if(c === 'cosh^2') return Math.pow(Math.cosh(x), 2);
      if(c === 'sech^2') return Math.pow(Math.cosh(x), -2);
      if(c === 'csch^2') return Math.pow(Math.sinh(x), -2);
      if(c === 'tanh^2') return Math.pow(Math.tanh(x), 2);
      if(c === 'coth^2') return Math.pow(Math.tanh(x), -2);
      if(c === 'log_2' || c === 'lg') return Math.log2(x);
      if(c === 'ln' || c === 'log') return Math.log(x);
      if(c === 'exp') return Math.exp(x);
    }
    if(this.operand_count() === 2) {
      // Binary functions
      const x = this.operand_exprs[0].evaluate(assignments);
      const y = this.operand_exprs[1].evaluate(assignments);
      if(x === null || y === null) return null;
      if(c === 'frac') return x/y;
      if(c === 'binom') return SpecialFunctions.binom(x, y);
    }
    return null;
  }

  as_editable_string() {
    // \operatorname{...} with a TextExpr inside.
    // This may have been created with Tab from math entry mode.
    if(this.command_name === 'operatorname' &&
       this.operand_count() === 1 &&
       this.operand_exprs[0].is_expr_type('text'))
      return this.operand_exprs[0].text;
    // Other commands are not considered 'editable' (yet).
    return null;
  }

  // 0-argument commands are left as-is (\alpha, etc)
  // 1-argument commands dissolve into their only argument.
  // 2-argument \frac breaks into numerator and denominator
  // 2-argument \overset and \underset break into their components in the proper visual order.
  // Everything else is left as-is.
  dissolve() {
    switch(this.operand_count()) {
    case 1:
      return this.operand_exprs;
    case 2:
      if(this.command_name === 'frac' || this.command_name === 'overset')
        return this.operand_exprs;
      else if(this.command_name === 'underset')
        return [this.operand_exprs[1], this.operand_exprs[0]];
      else return [this];
    default:
      return [this];
    }
  }
}


// FontExpr wraps another existing Expr and adds typeface/font information to it.
// A FontExpr sets independently the overall typeface (normal math, upright roman, etc)
// and a flag indicating bold/normal, plus an optional size adjustment that changes the
// size of the expression.
class FontExpr extends Expr {
  // typeface:
  //   'normal': regular italic math font
  //   'roman': \mathrm
  //   'sans_serif': \mathsf (upright sans serif)
  //   'sans_serif_italic': \mathsfit (italic sans serif)
  //   'typewriter': \mathtt
  //   'blackboard', 'fraktur', 'calligraphic', 'script': \mathbb, etc.
  // is_bold: true/false
  // size_adjustment:
  //   0=default, -1=\small, +1=\large, etc.
  //   Limited to -4 <= size <= 5.
  constructor(expr, typeface, is_bold, size_adjustment) {
    super();
    this.expr = expr;
    this.typeface = typeface;
    this.is_bold = !!is_bold;
    this.size_adjustment = size_adjustment || 0;
  }

  // Wrap an expression in FontExpr if it's not already.
  // This allows the FontExpr methods like with_typeface() to be used to add further styles.
  static wrap(expr) {
    if(expr.is_expr_type('font'))
      return expr;
    else return new FontExpr(expr, 'normal', false, 0);
  }

  // Wrap 'expr' in a Roman typeface FontExpr.
  static roman(expr) {
    return FontExpr.wrap(expr).with_typeface('roman');
  }

  static roman_text(str) {
    return FontExpr.roman(new TextExpr(LatexEmitter.latex_escape(str)));
  }

  // Return true when the two expressions are both FontExprs with the same font parameters.
  static font_exprs_compatible(left_expr, right_expr) {
    return left_expr.is_expr_type('font') && right_expr.is_expr_type('font') &&
      left_expr.typeface === right_expr.typeface &&
      left_expr.is_bold === right_expr.is_bold &&
      left_expr.size_adjustment === right_expr.size_adjustment;
  }

  expr_type() { return 'font'; }

  json_keys() { return ['expr', 'typeface']; }

  to_json() {
    let json = super.to_json();
    if(this.is_bold) json.is_bold = true;
    if(this.size_adjustment !== 0) json.size_adjustment = this.size_adjustment;
    return json;
  }

  visit(fn) {
    fn(this);
    this.expr.visit(fn);
  }

  // See comment in Expr.has_subexpressions().
  has_subexpressions() {
    return this.expr.has_subexpressions();
  }

  subexpressions() { return [this.expr]; }

  replace_subexpression(index, new_expr) {
    return new FontExpr(new_expr, this.typeface, this.is_bold, this.size_adjustment);
  }

  substitute_expr(old_expr, new_expr) {
    if(this === old_expr) return new_expr;
    return new FontExpr(
      this.expr.substitute_expr(old_expr, new_expr),
      this.typeface, this.is_bold, this.size_adjustment);
  }

  as_editable_string() {
    // If there is only a simple TextExpr inside, use that.
    if(this.contains_only_text())
      return LatexEmitter.latex_unescape(this.expr.text);
    else
      return this.expr.as_editable_string();
  }

  dissolve() { return [this.expr]; }

  contains_only_text() {
    return this.expr.is_expr_type('text');
  }

  // If this FontExpr is a "no-op", remove it by returning the wrapped expression directly.
  unwrap_if_possible() {
    if(this.typeface === 'normal' && !this.is_bold && this.size_adjustment === 0)
      return this.expr;
    else return this;
  }
  
  with_typeface(typeface) {
    return new FontExpr(this.expr, typeface, this.is_bold, this.size_adjustment);
  }

  with_bold(is_bold) {
    return new FontExpr(this.expr, this.typeface, is_bold, this.size_adjustment);
  }

  with_size_adjustment(size_adjustment) {
    return new FontExpr(
      this.expr, this.typeface, this.is_bold,
      Math.max(-4, Math.min(5, size_adjustment)));
  }

  emit_latex(emitter) {
    // If there is a size adjustment, emit the \large, etc, and then render
    // inside without the size adjustment.
    const size_adjustment_command = this.size_adjustment_command(this.size_adjustment);
    if(size_adjustment_command)  {
      // Size commands are stateful, so they need to be enclosed in their own group
      // so that the size adjustment does not continue beyond this expression.
      // i.e.: {\large ...} instead of \large{...}
      return emitter.grouped(() => {
	emitter.command(size_adjustment_command);
	this.with_size_adjustment(0).emit_latex(emitter);
      }, true);
    }
    const typeface_command = this.typeface_command(this.typeface, this.is_bold);
    const use_pmb = this.is_bold && this.use_pmb_for(this.typeface);
    if(!use_pmb && !typeface_command)
      emitter.expr(this.expr, 0);  // no-op (i.e., normal math text)
    else if(use_pmb && typeface_command) {
      // nested \pmb{\typeface_cmd{...}}
      emitter.command('pmb');
      emitter.grouped(() => {
	emitter.command(typeface_command);
	emitter.grouped_expr(this.expr, true, 0);
      }, true);
    }
    else {
      // either \pmb{...} or \typeface_cmd{...} (not both)
      emitter.command(use_pmb ? 'pmb' : typeface_command);
      emitter.grouped_expr(this.expr, true, 0);
    }
  }

  size_adjustment_command(size_adjustment) {
    // NOTE: -4 <= size_adjustment <= 5
    return [
      'tiny', 'scriptsize', 'footnotesize', 'small', null,
      'large', 'Large', 'LARGE', 'huge', 'Huge'][size_adjustment+4];
  }

  // Returns true if the given typeface's bold variant should be rendered using \pmb
  // on top of the non-bolded version (instead of using a dedicated command like \boldsymbol).
  use_pmb_for(typeface) {
    return [
      'sans_serif', 'sans_serif_italic', 'typewriter',
      'blackboard', 'fraktur', 'calligraphic', 'script'
    ].includes(typeface);
  }

  // TODO: bold fraktur font support?  KaTeX is supposed to support this,
  // but we might need to output Unicode characters instead of something like \boldfrak.

  // Return the LaTeX command used to render this typeface (null if no command is needed).
  // This is used in conjunction with use_pmb_for() so that typefaces without a bolded
  // version can be rendered as \pmb{...}
  typeface_command(typeface, is_bold) {
    switch(typeface) {
    case 'normal': return is_bold ? 'boldsymbol' : null;
    case 'roman': return is_bold ? 'bold' : 'mathrm';
    case 'sans_serif': return 'mathsf';
    case 'sans_serif_italic': return 'mathsfit';
    case 'typewriter': return 'mathtt';
    case 'blackboard': return 'mathbb';
    case 'fraktur': return 'mathfrak';
    case 'calligraphic': return 'mathcal';
    case 'script': return 'mathscr';
    default: return null;
    }
  }
}


// Represents two or more expressions joined by infix operators (like + or \wedge).
// This includes relational operators like = or <.
// operand_exprs: The x,y,z in 'x + y - z'.  There must be at least 2.
// operator_exprs: The +,- in 'x + y - z'.  Length must be 1 less than operand_exprs.
// split_at_index: Index of the operator_expr that is considered the 'split point'
//   for this InfixExpr.  Generally this is the last operator used to create the
//   infix expression.  For binary expressions this is 0; for something like 'x+y = z+w'
//   it would be 1 if the '=' was used to join the existing x+y and z+w.
// linebreaks_at: an array of integers specifying where (if any) the linebreaks
//   occur in this expression.  Currently linebreaks are only shown if the top-level
//   Expr in an ExprItem is an InfixExpr.  In that case, each integer index in
//   linebreaks_at indicates a line break *after* the given subexpression index.
//   For example, in 'x + y - z',
//   index=0 breaks after the 'x', index=1 breaks after the '+', etc.
//   Note that these indexes are different from the sense of 'split_at_index'.
class InfixExpr extends Expr {
  constructor(operand_exprs, operator_exprs, split_at_index, linebreaks_at) {
    super();
    this.operand_exprs = operand_exprs;
    this.operator_exprs = operator_exprs;
    this.split_at_index = split_at_index || 0;
    this.linebreaks_at = linebreaks_at || [];
  }

  // Combine two existing expressions into an InfixExpr, joined by
  // 'op_expr' as the infix operator.
  // If one or both of the expressions are already InfixExprs, they are
  // flattened into a larger InfixExpr.
  static combine_infix(left_expr, right_expr, op_expr) {
    let new_operand_exprs = [];
    let new_operator_exprs = [];
    let new_linebreaks_at = [];
    let linebreaks_midpoint = null;
    if(left_expr.is_expr_type('infix')) {
      new_operand_exprs = new_operand_exprs.concat(left_expr.operand_exprs);
      new_operator_exprs = new_operator_exprs.concat(left_expr.operator_exprs);
      new_linebreaks_at = new_linebreaks_at.concat(left_expr.linebreaks_at);
      linebreaks_midpoint = 2*left_expr.operand_exprs.length;
    }
    else {
      new_operand_exprs.push(left_expr);
      linebreaks_midpoint = 2;
    }
    // Determine index of the new op_expr within the new InfixExpr;
    // this becomes the split_at_index determining where things like
    // do_infix_linebreak() apply at.
    const split_at_index = new_operator_exprs.length;
    new_operator_exprs.push(op_expr);
    if(right_expr.is_expr_type('infix')) {
      new_operand_exprs = new_operand_exprs.concat(right_expr.operand_exprs);
      new_operator_exprs = new_operator_exprs.concat(right_expr.operator_exprs);
      new_linebreaks_at = new_linebreaks_at.concat(
        right_expr.linebreaks_at.map(index => linebreaks_midpoint+index));
    }
    else
      new_operand_exprs.push(right_expr);
    return new InfixExpr(
      new_operand_exprs,
      new_operator_exprs,
      split_at_index,
      new_linebreaks_at);
  }

  expr_type() { return 'infix'; }

  json_keys() { return ['operand_exprs', 'operator_exprs', 'split_at_index']; }

  to_json() {
    let json = super.to_json();
    if(this.linebreaks_at.length > 0)
      json.linebreaks_at = this.linebreaks_at;
    return json;
  }

  // If the given infix operator is a simple command like '+' or '\cap',
  // return the command name (without the initial \ if it has one).
  // If it's anything more complex, return null.
  // If 'op_expr' is omitted, check only the operator at the split_at point.
  operator_text(op_expr) {
    if(op_expr) {
      if(op_expr.is_expr_type('command') && op_expr.operand_count() === 0)
        return op_expr.command_name;
      else if(op_expr.is_expr_type('text'))
        return op_expr.text;
      else
        return null;
    }
    else
      return this.operator_text(this.operator_exprs[this.split_at_index]);
  }

  operator_text_at(index) {
    return this.operator_text(this.operator_exprs[index]);
  }

  // 'Editable' version of the operator (for use in math entry mode).
  editable_operator_text_at(index) {
    const s = this.operator_text_at(index);
    if(s === '+' || s === '-' || s === '/')
      return s;
    else if(s === 'cdot')
      return '*';
    else
      return null;
  }
  
  // e.g. operator_text==='/' would match 'x/y'.
  is_binary_operator_with(operator_text) {
    return this.operator_exprs.length === 1 &&
      this.operator_text(this.operator_exprs[0]) === operator_text;
  }

  // Check if this is a low-precedence infix expression like x+y
  // This is mostly for convenience so it doesn't need to be that precise.
  // TODO: reduce or eliminate the need for this; there is probably a cleaner way
  needs_autoparenthesization() {
    return this.operator_exprs.every(op_expr => {
      const op = this.operator_text(op_expr);
      return op && this._operator_info(op) && this._operator_info(op).prec <= 1;
    });
  }

  // 'inside_delimiters' is set to true when this InfixExpr is rendered
  // as the inner_expr of a DelimiterExpr.
  // This gives us a chance to convert things like \parallel into
  // their flexible \middle counterparts.
  emit_latex(emitter, inside_delimiters) {
    const is_top_level = (this === emitter.base_expr);
    for(let i = 0; i < this.operator_exprs.length; i++) {
      emitter.expr(this.operand_exprs[i], 2*i);
      if(is_top_level && this.linebreaks_at.includes(2*i)) {
        // Break before ith operator.
        emitter.command("\\");  // outputs two backslashes (LaTeX newline command)
        emitter.command("qquad");
      }
      let emitted_expr = this.operator_exprs[i];
      if(inside_delimiters) {
        // Try converting to flex delimiter.
        const converted_expr = this._convert_to_flex_delimiter(emitted_expr);
        if(converted_expr)
          emitted_expr = converted_expr;
      }
      emitter.expr(emitted_expr, 2*i+1);
      if(is_top_level && this.linebreaks_at.includes(2*i+1)) {
        // Break after ith operator.
        emitter.command("\\");
        emitter.command("qquad");
      }
    }
    emitter.expr(
      this.operand_exprs[this.operand_exprs.length-1],
      2*this.operator_exprs.length);
  }

  _convert_to_flex_delimiter(expr) {
    let new_text = null;
    if(expr.is_expr_type('text') && expr.text === '/')
      new_text = "\\middle/";
    else if(expr.is_expr_type('command') && expr.operand_count() === 0) {
      const command = expr.command_name;
      if(command === ",\\vert\\," || command === 'vert')
        new_text = "\\,\\middle\\vert\\,";
      else if(command === 'parallel')
        new_text ="\\,\\middle\\Vert\\,";
      else if(/*command === 'setminus' ||*/ command === 'backslash')
        new_text = "\\middle\\backslash ";
    }
    if(new_text)
      return new TextExpr(new_text);
    else
      return null;
  }

  visit(fn) {
    fn(this);
    this.subexpressions().forEach(expr => expr.visit(fn));
  }

  subexpressions() {
    // Interleave operators and operands.
    let exprs = [];
    for(let i = 0; i < this.operator_exprs.length; i++) {
      exprs.push(this.operand_exprs[i]);
      exprs.push(this.operator_exprs[i]);
    }
    exprs.push(this.operand_exprs[this.operand_exprs.length-1]);
    return exprs;
  }

  // Even indices reference operands; odd indices reference operators.
  replace_subexpression(index, new_expr) {
    return new InfixExpr(
      this.operand_exprs.map((operand_expr, expr_index) =>
        expr_index*2 === index ? new_expr : operand_expr),
      this.operator_exprs.map((operator_expr, expr_index) =>
        expr_index*2 + 1 === index ? new_expr : operator_expr),
      this.split_at_index,
      this.linebreaks_at);
  }

  substitute_expr(old_expr, new_expr) {
    if(this === old_expr) return new_expr;
    return new InfixExpr(
      this.operand_exprs.map(expr => expr.substitute_expr(old_expr, new_expr)),
      this.operator_exprs.map(expr => expr.substitute_expr(old_expr, new_expr)),
      this.split_at_index,
      this.linebreaks_at);
  }

  has_linebreak_at(index) {
    return this.linebreaks_at.includes(index);
  }

  without_linebreak_at(old_index) {
    return new InfixExpr(
      this.operand_exprs,
      this.operator_exprs,
      this.split_at_index,
      this.linebreaks_at.filter(index => index !== old_index));
  }

  with_linebreak_at(new_index) {
    return new InfixExpr(
      this.operand_exprs,
      this.operator_exprs,
      this.split_at_index,
      this.linebreaks_at.concat([new_index]));
  }

  // Swap everything to the left of operator_index with everything to the right of operator_index.
  swap_sides_at(operator_index) {
    const new_operand_exprs =
          this.operand_exprs.slice(operator_index+1).concat(
            this.operand_exprs.slice(0, operator_index+1));
    const new_operator_exprs =
          this.operator_exprs.slice(operator_index+1).concat(
            [this.operator_exprs[operator_index]]).concat(
              this.operator_exprs.slice(0, operator_index));
    // NOTE: linebreaks_at is discarded here, otherwise the result
    // isn't very intuitive.
    return new InfixExpr(
      new_operand_exprs,
      new_operator_exprs,
      new_operator_exprs.length - this.split_at_index - 1);
  }

  // Extract everything to one side of the given operator index.
  // The resulting Expr may not necessarily be another InfixExpr.
  // 'side' can be 'left' or 'right'.
  // NOTE: The new split_at_index will always be 0.  There is not a good way
  // to do this properly currently since we only track the most recent operator
  // in InfixExpr.
  extract_side_at(operator_index, side) {
    if(side === 'right') {
      if(operator_index === this.operator_exprs.length-1)
        return this.operand_exprs[operator_index+1];  // rightmost operand
      else
        return new InfixExpr(
          this.operand_exprs.slice(operator_index+1),
          this.operator_exprs.slice(operator_index+1),
          0, null);
    }
    else {
      if(operator_index === 0)
        return this.operand_exprs[0];  // leftmost operand
      else
        return new InfixExpr(
          this.operand_exprs.slice(0, operator_index+1),
          this.operator_exprs.slice(0, operator_index),
          0, null);
    }
  }

  // If this expression is "scientific notation" such as 3 \times 10^-2,
  // return [coefficient_text, exponent_text] (e.g. ['3', '-2'] in this case).
  // The expression must be of this exact form, with literal numbers for the
  // coefficient and exponent.  Return null if it's not of this form.
  _unparse_scientific_notation() {
    if(!(this.operator_exprs.length === 1 &&
	 this.operator_exprs[0].is_expr_type('command') &&
	 this.operator_exprs[0].command_name === 'times'))
      return null;
    const [lhs, rhs] = this.operand_exprs;
    if(lhs.is_expr_type('text') && lhs.looks_like_number() &&
       rhs.is_expr_type('subscriptsuperscript') &&
       rhs.base_expr.is_expr_type('text') && rhs.base_expr.text === '10' &&
       !rhs.subscript_expr && rhs.superscript_expr &&
       rhs.superscript_expr.is_expr_type('text') &&
       rhs.superscript_expr.looks_like_number())
      return [lhs.text, rhs.superscript_expr.text];
    else
      return null;
  }

  as_editable_string() {
    // Special case: unparse scientific notation for infix expressions
    // like 3 \times 10^-2 -> 3e-2
    // NOTE: Expressions like 1 + 3 \times 10^-2 are flattened into
    // larger InfixExprs so this unparsing will not work in that case.
    const scientific_notation_pieces = this._unparse_scientific_notation();
    if(scientific_notation_pieces)
      return scientific_notation_pieces.join('e');

    const operator_strings = this.operator_exprs.map(
      (expr, index) => this.editable_operator_text_at(index));
    const operand_strings = this.operand_exprs.map(
      expr => expr.as_editable_string());
    if(operator_strings.some(s => s === null) ||
       operand_strings.some(s => s === null))
      return null;
    // Interleave the operand and operator pieces.
    let pieces = [operand_strings[0]];
    for(let i = 0; i < operator_strings.length; i++) {
      pieces.push(operator_strings[i]);
      pieces.push(operand_strings[i+1]);
    }
    return pieces.join('');   
  }

  // InfixExprs dissolve into their operand expressions.
  // Operators are discarded.
  dissolve() { return this.operand_exprs; }

  // Bold each operand, but leave the operators alone.
  as_bold() {
    return new InfixExpr(
      this.operand_exprs.map(expr => expr.as_bold()),
      this.operator_exprs,
      this.split_at_index,
      this.linebreaks_at);
  }

  evaluate(assignments) {
    // Evaluate taking into account the binary operator precedences.
    const operand_values = this.operand_exprs.map(
      expr => expr.evaluate(assignments));
    const operator_infos = this.operator_exprs.map(
      expr => this._operator_info(this.operator_text(expr)));
    if(operand_values.some(value => value === null) ||
       operator_infos.some(info => info === null))
      return null;  // give up if anything is non-evaluable
    // NOTE: There are really only 2 precedences involved here
    // (+- and /*) so this could be simplified to not need the stack stuff.
    let value_stack = [operand_values[0]];
    let op_stack = [];  // stores _operator_info structures
    let eval_stack_op = () => {
      const stack_op_info = op_stack.pop();
      const rhs = value_stack.pop();
      const lhs = value_stack.pop();
      value_stack.push(stack_op_info.fn(lhs, rhs));
    };
    for(let i = 0; i < this.operator_exprs.length; i++) {
      const op_info = operator_infos[i];
      while(op_stack.length > 0 &&
	    op_stack[op_stack.length-1].prec >= op_info.prec)
        eval_stack_op();
      op_stack.push(op_info);
      value_stack.push(operand_values[i+1]);
    }
    while(op_stack.length > 0)
      eval_stack_op();
    return value_stack.pop();
  }

  // Return {precedence, eval_fn}, or null if the operator can't be evaluated.
  // TODO: also return associativity if ^ (power) is added.
  _operator_info(op) {
    switch(op) {
    case '+':     return {prec:1, fn:(x,y) => x+y};
    case '-':     return {prec:1, fn:(x,y) => x-y};
    case 'cdot':  return {prec:2, fn:(x,y) => x*y};
    case 'times': return {prec:2, fn:(x,y) => x*y};
    case '/':     return {prec:2, fn:(x,y) => x/y};
    default: return null;
    }
  }
}


// Represents a "placeholder marker" that can be used with the 'substitute_placeholder' command.
class PlaceholderExpr extends Expr {
  expr_type() { return 'placeholder'; }
  json_keys() { return []; }

  emit_latex(emitter) {
    const expr = new CommandExpr('htmlClass', [
      new TextExpr('placeholder_expr'),
      new TextExpr("\\blacksquare")]);
    emitter.expr(expr, null);
  }

  as_editable_string() { return '[]'; }
}


// Represents a postfix operation where the operator comes after the operand.
// Currently this is only used for factorial and double-factorial notation.
// Potentially this could be used for things like transpose and conjugate, but
// those are currently treated as SubscriptSuperscriptExprs.
// The main use case for PostfixExpr currently is for representing and evaluating things
// like '3!4!' (= 144) which would otherwise be a SequenceExpr['3', '!', '4', '!'].
// NOTE: Double factorials (x!!) are actually represented as
//       PostfixExpr(PostfixExpr(x, '!'), '!') instead of PostfixExpr(x, '!!').
class PostfixExpr extends Expr {
  // Create a factorial expression with 'factorial_depth' exclamation points.
  static factorial_expr(base_expr, factorial_depth) {
    if(factorial_depth > 1)
      base_expr = PostfixExpr.factorial_expr(base_expr, factorial_depth-1);
    return new PostfixExpr(base_expr, new TextExpr('!'));
  }
  
  constructor(base_expr, operator_expr) {
    super();
    this.base_expr = base_expr;
    this.operator_expr = operator_expr;
  }
  
  expr_type() { return 'postfix'; }
  json_keys() { return ['base_expr', 'operator_expr']; }

  emit_latex(emitter) {
    emitter.expr(this.base_expr, 0);
    emitter.expr(this.operator_expr, 1);
  }

  visit(fn) {
    fn(this);
    this.subexpressions().forEach(expr => expr.visit(fn));
  }

  has_subexpressions() { return true; }
  subexpressions() { return [this.base_expr, this.operator_expr]; }

  replace_subexpression(index, new_expr) {
    return new PostfixExpr(
      index === 0 ? new_expr : this.base_expr,
      index === 1 ? new_expr : this.operator_expr);
  }

  substitute_expr(old_expr, new_expr) {
    if(this === old_expr) return new_expr;
    return new PostfixExpr(
      this.base_expr.substitute_expr(old_expr, new_expr),
      this.operator_expr.substitute_expr(old_expr, new_expr));
  }

  as_editable_string() {
    const base_string = this.base_expr.as_editable_string();
    const operator_string = this.operator_expr.as_editable_string();
    if(base_string && operator_string)
      return [base_string, operator_string].join('');
    else
      return null;
  }

  dissolve() { return [this.base_expr, this.operator_expr]; }

  as_bold() {
    return new PostfixExpr(
      this.base_expr.as_bold(),
      this.operator_expr.as_bold());
  }

  // Factorial expressions with multiple ! signs are represented as nested
  // PostfixExprs with single-! operators.  For example:
  //   x!!! = Postfix(Postfix(Postfix(x, '!'), '!'), '!')
  // Return [base_expr, factorial_signs_count], where base_expr is the innermost 'x'
  // and factorial_signs_count is the number of nested factorial signs (3 in this case).
  // Non-factorial postfix expressions will return factorial_signs_count=0.
  analyze_factorial() {
    let [base_expr, factorial_signs_count] = [this.base_expr, 0];
    if(this.operator_expr.is_expr_type('text') && this.operator_expr.text === '!') {
      if(this.base_expr.is_expr_type('postfix'))
	[base_expr, factorial_signs_count] = base_expr.analyze_factorial();
      factorial_signs_count++;
    }
    return [base_expr, factorial_signs_count];
  }

  // Currently the only PostfixExprs that can be evaluated are single and double factorials.
  // i.e. 3! = 1*2*3;  7!! = 7*5*3*1.
  // Double factorial arguments must be integers, while single factorials can be
  // real numbers evaluated via the Gamma function.
  evaluate(assignments) {
    let [base_expr, factorial_signs_count] = this.analyze_factorial();
    if(!(factorial_signs_count === 1 || factorial_signs_count === 2))
      return null;
    const value = base_expr.evaluate(assignments);
    if(value === null) return null;
    if(factorial_signs_count === 1)
      return SpecialFunctions.factorial(value);
    else if(factorial_signs_count === 2) {
      const result = SpecialFunctions.double_factorial(value);
      return isNaN(result) ? null : result;
    }
    return null;
  }
}


// Represents a snippet of LaTeX code; these are the "leaves" of Expr-trees.
class TextExpr extends Expr {
  static blank() { return new TextExpr(''); }
  
  constructor(text) {
    super();
    this.text = text;
  }

  expr_type() { return 'text'; }
  json_keys() { return ['text']; }

  emit_latex(emitter) {
    // Check explicitly for '-123'.
    // These need to be enclosed in latex braces to get the proper
    // spacing in things like x+-3.
    emitter.text(this.text, this.looks_like_negative_number());
  }

  looks_like_number() {
    // cf. ExprParser.tokenize()
    return /^-?\d*\.?\d+$/.test(this.text);
  }

  looks_like_negative_number() {
    return /^-\d*\.?\d+$/.test(this.text);
  }

  // Check for single-letter variable names.
  // Used by do_evaluate_with_variable_substitution()
  looks_like_variable_name() {
    return /^\w$/.test(this.text);
  }

  as_editable_string() {
    if(this.looks_like_number() ||
       /^\w+$/.test(this.text) ||
       this.text === '!')
      return this.text;
    else
      return null;
  }

  evaluate(assignments) {
    const s = this.text;
    const assigned_val = assignments[s];
    if(assigned_val !== undefined && assigned_val !== null)
      return assigned_val;
    // Check for known constants.
    // Note though that these are typically CommandExprs
    // (CommandExpr also checks for known constants).
    if(s === "\\pi") return Math.PI;
    if(s === "\\infty") return Infinity;
    const val = parseFloat(s);
    if(isNaN(val))
      return null;
    else
      return val;
  }
}


// Represents a sequence of expressions all concatenated together.
// Adjacent SequenceExprs can be merged together; see Expr.combine_pair().
// If 'fused' is true, this will not be combined with other adjacent
// sequences in Expr.combine_pair(), etc.
// This can be used to group things that functionally belong together
// like f(x), which matters for 'dissect' mode.
class SequenceExpr extends Expr {
  constructor(exprs, fused) {
    super();
    this.exprs = exprs;
    this.fused = !!fused;
  }

  expr_type() { return 'sequence'; }
  json_keys() { return ['exprs']; }

  to_json() {
    let json = super.to_json();
    if(this.fused) json.fused = true;
    return json;
  }

  emit_latex(emitter) {
    if(this.exprs.length === 2 && this.fused &&
       this.exprs[1].is_expr_type('delimiter')) {
      // Special case: Two-element "fused" SequenceExprs of the form
      // [Expr, DelimiterExpr] automatically wrap the DelimiterExpr in an "empty"
      // latex command (i.e., set of braces).
      // For example: f(x) is [TextExpr('f'), DelimiterExpr('(', 'x', ')')]
      // so this becomes f{(x)} instead of f(x).  This has the effect of tightening
      // the spacing after f to better match normal function notation.
      emitter.expr(this.exprs[0], 0);
      emitter.grouped_expr(this.exprs[1], 'force', 1);
    }
    else
      this.exprs.forEach((expr, index) => emitter.expr(expr, index));
  }

  visit(fn) {
    fn(this);
    this.exprs.forEach(expr => expr.visit(fn));
  }

  subexpressions() { return this.exprs; }

  replace_subexpression(index, new_expr) {
    return new SequenceExpr(
      this.exprs.map(
        (subexpr, subexpr_index) => subexpr_index === index ? new_expr : subexpr),
      this.fused);
  }

  substitute_expr(old_expr, new_expr) {
    if(this === old_expr) return new_expr;
    return new SequenceExpr(
      this.exprs.map(expr => expr.substitute_expr(old_expr, new_expr)),
      this.fused);
  }

  as_editable_string() {
    let pieces = this.exprs.map(expr => expr.as_editable_string());
    // Special case: ['-', Expr]
    if(pieces.length === 2 &&
       this.exprs[0].is_expr_type('text') && this.exprs[0].text === '-')
      pieces[0] = '-';  // just hack it into the list
    if(pieces.every(s => s !== null))
      return pieces.join('');
    else
      return null;
  }

  dissolve() { return this.exprs; }

  as_bold() {
    return new SequenceExpr(
      this.exprs.map(expr => expr.as_bold()),
      this.fused);
  }

  evaluate(assignments) {
    // Check for ['-', Expr] and ['+', Expr]
    if(this.exprs.length >= 2 &&
       this.exprs[0].is_expr_type('text')) {
      let sign = null;
      if(this.exprs[0].text === '+') sign = 1;
      else if(this.exprs[0].text === '-') sign = -1;
      if(sign !== null)
        return sign * (new SequenceExpr(
	  this.exprs.slice(1), this.fused).evaluate(assignments));
    }
    // Consider anything else as implicit multiplications.
    let value = this.exprs[0].evaluate(assignments);
    if(value === null) return null;
    for(let i = 1; i < this.exprs.length; i++) {
      const rhs = this.exprs[i].evaluate(assignments);
      if(rhs === null) return null;
      value *= rhs;
      if(isNaN(value)) return null;
    }
    return value;
  }
}


// Represents an expression enclosed in left/right delimiters.
// Normally the delimiters are "flex-size": \left(xyz\right)
// but setting fixed_sized to true gives "normal" delimiters (xyz) instead.
//
// NOTE: If the enclosed expression is an InfixExpr, this attempts to convert
// infix operators to their flex-size equivalent if they have one.
// For example: <x|y>  -> \left\langle x\middle\vert y\right\rangle
class DelimiterExpr extends Expr {
  constructor(left_type, right_type, inner_expr, fixed_size) {
    super();
    this.left_type = left_type;
    this.right_type = right_type;
    this.inner_expr = inner_expr;
    this.fixed_size = fixed_size || false;
  }

  static parenthesize(expr) {
    // Special case: if expr itself is a DelimiterExpr with "blank" delimiters,
    // just replace the blanks with parentheses instead of re-wrapping expr.
    if(expr.is_expr_type('delimiter') &&
       expr.left_type === '.' && expr.right_type === '.')
      return new DelimiterExpr('(', ')', expr.inner_expr);
    return new DelimiterExpr('(', ')', expr);
  }

  static parenthesize_if_not_already(expr) {
    if(expr.is_expr_type('delimiter')) {
      if(expr.left_type === '.' && expr.right_type === '.')
        return new DelimiterExpr('(', ')', expr.inner_expr);
      else
        return expr;
    }
    else
      return this.parenthesize(expr);
  }

  // expr is about to become the base of a SubscriptSuperscriptExpr.
  // The expression will be parenthesized if it is:
  //   - any kind of InfixExpr
  //   - any kind of SequenceExpr that is not a function application
  //     of the form [anything, DelimiterExpr] (we want to still have f(x)^3 etc.)
  //   - a normal fraction like \frac{x}{y}
  //   - a "flex style" fraction like \left. x/y \right.
  //   - TODO: parenthesize \ln{x}, etc., unless x is a DelimiterExpr
  //     (but not if x is a FontExpr)
  static parenthesize_for_power(expr) {
    const needs_parenthesization = (
      // any infix expression
      expr.is_expr_type('infix') ||

      // any SequenceExpr that is not [anything, DelimiterExpr]
      // cf. SequenceExpr.emit_latex
      (expr.is_expr_type('sequence') &&
       !(expr.exprs.length === 2 &&
         expr.exprs[1].is_expr_type('delimiter'))) ||
        
      // \frac{x}{y}
      (expr.is_expr_type('command') &&
       expr.command_name === 'frac' &&
       expr.operand_count() === 2) ||

      // \left. x/y \right.
      // (x/y is an InfixExpr); this is a "flex size fraction".
      // TODO: add is_flex_inline_fraction() or something; this
      // logic is duplicated elsewhere.
      (expr.is_expr_type('delimiter') &&
       expr.left_type === '.' && expr.right_type === '.' &&
       expr.inner_expr.is_expr_type('infix') &&
       expr.inner_expr.is_binary_operator_with('/'))
    );
    if(needs_parenthesization)
      return DelimiterExpr.parenthesize(expr);
    else
      return expr;
  }

  // Parenthesize 'expr' only if it's a low-precedence InfixExpr like 'x+y'.
  static autoparenthesize(expr) {
    if(expr.is_expr_type('infix') && expr.needs_autoparenthesization())
      return DelimiterExpr.parenthesize(expr);
    else
      return expr;
  }
  
  expr_type() { return 'delimiter'; }
  json_keys() { return ['left_type', 'right_type', 'inner_expr']; }

  emit_latex(emitter) {
    if(this.fixed_size)
      this.emit_latex_fixed_size(emitter);
    else
      this.emit_latex_flex_size(emitter);
  }

  emit_latex_flex_size(emitter) {
    emitter.command('left');
    emitter.text_or_command(this.left_type);
    emitter.expr(this.inner_expr, 0, true);  // true: inside_delimiters
    emitter.command('right');
    emitter.text_or_command(this.right_type);
  }

  emit_latex_fixed_size(emitter) {
    if(this.left_type !== '.')
      emitter.text_or_command(this.left_type);
    emitter.expr(this.inner_expr, 0);
    if(this.right_type !== '.')
      emitter.text_or_command(this.right_type);
  }

  // Return a copy of this expression but with the given fixed_size flag.
  as_fixed_size(fixed_size) {
    return new DelimiterExpr(
      this.left_type,
      this.right_type,
      this.inner_expr,
      fixed_size);
  }

  to_json() {
    let json = super.to_json();
    if(this.fixed_size) json.fixed_size = true;
    return json;
  }

  visit(fn) {
    fn(this);
    this.inner_expr.visit(fn);
  }

  has_subexpressions() { return true; }
  subexpressions() { return [this.inner_expr]; }

  replace_subexpression(index, new_expr) {
    return new DelimiterExpr(
      this.left_type,
      this.right_type,
      new_expr,
      this.fixed_size);
  }

  substitute_expr(old_expr, new_expr) {
    if(this === old_expr) return new_expr;
    return new DelimiterExpr(
      this.left_type,
      this.right_type,
      this.inner_expr.substitute_expr(old_expr, new_expr),
      this.fixed_size);
  }

  as_editable_string() {
    const inner_string = this.inner_expr.as_editable_string();
    if(!inner_string) return null;
    let [left, right] = [null, null];
    if(this.left_type === "\\{" && this.right_type === "\\}")
      [left, right] = ['{', '}'];
    else if(this.left_type === "[" && this.right_type === "]")
      [left, right] = ['[', ']'];
    else if(this.left_type === "(" && this.right_type === ")")
      [left, right] = ['(', ')'];
    if(left && right)
      return [left, inner_string, right].join('');
    else
      return null;
  }

  // Dissolving removes the delimiters.
  dissolve() { return [this.inner_expr]; }        

  evaluate(assignments) {
    return this.inner_expr.evaluate(assignments);
  }
}


// Represents a base expression with either a subscript or superscript, or both.
class SubscriptSuperscriptExpr extends Expr {
  constructor(base_expr, subscript_expr, superscript_expr) {
    super();
    this.base_expr = base_expr;
    this.subscript_expr = subscript_expr;
    this.superscript_expr = superscript_expr;
  }

  // If the base already has a subscript, and is_superscript is true, the superscript
  // is placed into the existing base.  Otherwise, a new subscript/superscript node
  // is created.  A similar rule applies if is_superscript is false.
  static build_subscript_superscript(base_expr, child_expr, is_superscript, autoparenthesize) {
    // Check to see if we can put the child into an empty sub/superscript "slot".
    if(base_expr.is_expr_type('subscriptsuperscript') &&
       ((base_expr.subscript_expr === null && !is_superscript) ||
        (base_expr.superscript_expr === null && is_superscript))) {
      // There's "room" for it in this expr.
      return new SubscriptSuperscriptExpr(
        base_expr.base_expr,
        (is_superscript ? base_expr.subscript_expr : child_expr),
        (is_superscript ? child_expr : base_expr.superscript_expr));
    }
    else {
      // Create a new expr instead, parenthesizing the base if needed.
      if(autoparenthesize)
        base_expr = DelimiterExpr.parenthesize_for_power(base_expr);
      return new SubscriptSuperscriptExpr(
        base_expr,
        (is_superscript ? null : child_expr),
        (is_superscript ? child_expr : null));
    }
  }

  expr_type() { return 'subscriptsuperscript'; }
  json_keys() { return ['base_expr', 'subscript_expr', 'superscript_expr']; }

  emit_latex(emitter) {
    // If the base_expr is a command, don't put it inside grouping braces.
    // This accounts for attaching subscripts or superscripts to commands
    // with arguments such as \underbrace{xyz}_{abc}.
    if(this.base_expr.is_expr_type('command'))
      emitter.expr(this.base_expr, 0);
    else
      emitter.grouped_expr(this.base_expr, false, 0);
    let subexpr_index = 1;
    if(this.superscript_expr) {
      emitter.text('^');
      emitter.grouped_expr(this.superscript_expr, 'force_commands', subexpr_index);
      subexpr_index++;
    }
    if(this.subscript_expr) {
      emitter.text('_');
      // 'force_commands' ensures that single LaTeX commands are still grouped, even
      // though single-letter super/subscripts are still OK to leave ungrouped.
      // e.g.: x^{\sum} instead of x^\sum, but x^2 is fine.
      emitter.grouped_expr(this.subscript_expr, 'force_commands', subexpr_index);
      subexpr_index++;  // not strictly needed
    }
  }

  visit(fn) {
    fn(this);
    this.subexpressions().forEach(expr => expr.visit(fn));
  }

  subexpressions() {
    let exprs = [this.base_expr];
    if(this.superscript_expr) exprs.push(this.superscript_expr);
    if(this.subscript_expr) exprs.push(this.subscript_expr);
    return exprs;
  }

  // NOTE: the meaning of 'index' may vary depending on whether sub/superscript is populated.
  replace_subexpression(index, new_expr) {
    return new SubscriptSuperscriptExpr(
      index === 0 ? new_expr : this.base_expr,
      (index === 2 || (!this.superscript_expr && index === 1)) ? new_expr : this.subscript_expr,
      (index === 1 && this.superscript_expr) ? new_expr : this.superscript_expr);
  }

  substitute_expr(old_expr, new_expr) {
    if(this === old_expr) return new_expr;
    return new SubscriptSuperscriptExpr(
      this.base_expr.substitute_expr(old_expr, new_expr),
      this.subscript_expr ? this.subscript_expr.substitute_expr(old_expr, new_expr) : null,
      this.superscript_expr ? this.superscript_expr.substitute_expr(old_expr, new_expr) : null);
  }

  // Components are dissolved in the order: base, subscript, superscript
  // This matches the order of [/][Enter] so a fully populated SubscriptSuperscriptExpr
  // can be reassembled with this command.
  dissolve() {
    // TODO: This order differs from this.subexpressions().
    // Probably should fix this inconsistency.
    const pieces = [this.base_expr];
    if(this.subscript_expr) pieces.push(this.subscript_expr);
    if(this.superscript_expr) pieces.push(this.superscript_expr);
    return pieces;
  }

  evaluate(assignments) {
    const base_expr = this.base_expr;
    const sub_expr = this.subscript_expr;
    const sup_expr = this.superscript_expr;

    // Check for expressions of the form f(x) |_ {x=val}
    // i.e., a "where" clause formed by something like [/][|].
    if(sub_expr !== null && sup_expr === null &&
       base_expr.is_expr_type('delimiter') &&
       base_expr.left_type === '.' && base_expr.right_type === "\\vert" &&
       sub_expr.is_expr_type('infix') &&
       sub_expr.operator_text_at(0) === '=') {
      // Subscript expression should be of the form x=(something).
      // Also try to handle \alpha=(something).  In this case the left side
      // is a CommandExpr with a 0-argument command.
      const lhs = sub_expr.extract_side_at(0, 'left');
      const rhs = sub_expr.extract_side_at(0, 'right');
      if((lhs.is_expr_type('text') && lhs.looks_like_variable_name()) ||
	 (lhs.is_expr_type('command') && lhs.operand_count() === 0)) {
	const subst_value = rhs.evaluate(assignments);
	if(subst_value !== null) {
	  let new_assignments = Object.assign({}, assignments);  // shallow copy
	  if(lhs.is_expr_type('text'))
	    new_assignments[lhs.text] = subst_value;
	  else if(lhs.is_expr_type('command'))
	    new_assignments[lhs.command_name] = subst_value;
	  return base_expr.inner_expr.evaluate(new_assignments);
	}
      }
    }

    // Anything else with a subscript can't be evaluated.
    if(sub_expr !== null) return null;

    // Check for e^x notation created by [/][e].
    if(base_expr.is_expr_type('font') &&
       base_expr.typeface === 'roman' &&
       base_expr.contains_only_text() &&
       base_expr.expr.text === 'e') {
      const exponent_value = sup_expr.evaluate(assignments);
      if(exponent_value === null) return null;
      const value = Math.exp(exponent_value);
      if(isNaN(value))
        return null;
      else
        return value;
    }

    const base_value = base_expr.evaluate(assignments);

    // Check for "degrees" notation.
    if(base_value !== null &&
       sup_expr.is_expr_type('command') &&
       sup_expr.operand_count() === 0 &&
       sup_expr.command_name === 'circ') {
      const radians = base_value * Math.PI / 180.0;
      return radians;
    }

    // Assume it's a regular x^y power expression.
    if(base_value === null) return null;
    const exponent_value = sup_expr.evaluate(assignments);
    if(exponent_value === null) return null;
    const value = Math.pow(base_value, exponent_value);
    if(isNaN(value))
      return null;
    else
      return value;
  }
}


// Arrayed structures; these are all 2-dimensional grids of expressions.
// Currently supported "array types" are:
//   matrices: bmatrix, Bmatrix, matrix, pmatrix, vmatrix, Vmatrix
//   non-matrices (alignment environments): gathered, gather, cases, rcases, substack
class ArrayExpr extends Expr {
  // element_exprs is a nested array of length 'row_count', each of which is
  // an array of 'column_count' Exprs.
  // row_separators and column_separators can either be null or an array of N-1
  // items (where N is the row or column count respectively).  Each item can be
  // one of: [null, 'solid', 'dashed'] indicating the type of separator to put
  // between the corresponding row or column.
  constructor(array_type, row_count, column_count, element_exprs,
              row_separators, column_separators) {
    super();
    this.array_type = array_type;
    this.row_count = row_count;
    this.column_count = column_count;
    this.element_exprs = element_exprs;
    this.row_separators = row_separators || new Array(row_count-1).fill(null);
    this.column_separators = column_separators || new Array(column_count-1).fill(null);
  }

  // Stack two ArrayExprs on top of each other.
  // If column counts do not match, null is returned.
  static vstack_arrays(expr1, expr2) {
    if(expr1.column_count !== expr2.column_count)
      return null;
    return new ArrayExpr(
      expr1.array_type,
      expr1.row_count + expr2.row_count,
      expr1.column_count,
      expr1.element_exprs.concat(expr2.element_exprs),
      expr1.row_separators.concat([null], expr2.row_separators),
      expr1.column_separators);
  }

  // Stack two ArrayExprs side by side.
  // If row counts do not match, null is returned.
  static hstack_arrays(expr1, expr2) {
    if(expr1.row_count !== expr2.row_count)
      return null;
    let new_element_exprs = [];
    for(let i = 0; i < expr1.row_count; i++)
      new_element_exprs.push(expr1.element_exprs[i].concat(expr2.element_exprs[i]));
    return new ArrayExpr(
      expr1.array_type,
      expr1.row_count,
      expr1.column_count + expr2.column_count,
      new_element_exprs,
      expr1.row_separators,
      expr1.column_separators.concat([null], expr2.column_separators));
  }

  // Split up a 1-D list of expressions into a 2-D grid of array elements
  // (for placing alignment markers automatically for "\cases" and such).
  // split_mode: 
  //   'none': do nothing, just put each entry_expr in its own row
  //   'infix': place alignment markers before infix, if any
  //   'colon': if there is a ':' infix, remove it and place alignment marker where it was
  //   'colon_if': like 'colon', but place the word "if" before the right-hand side if there
  //               is a ':' infix.  If there is no ':' infix, the right-hand side becomes 'otherwise'.
  static split_elements(exprs, split_mode) {
    return exprs.map(expr => ArrayExpr._split_expr(expr, split_mode));
  }

  // Split up 'expr' into separately-aligned 'columns'.
  static _split_expr(expr, split_mode) {
    switch(split_mode) {
    case 'none':
      return [expr];
    case 'infix':
      if(expr.is_expr_type('infix')) {
        // Left side will be the left "side" of the infix at its split_at_index point.
        // Right side will be the right "side", but we have to insert a new initial "fake"
        // blank operand to give it the right structure.
        return [
          expr.extract_side_at(expr.split_at_index, 'left'),
          InfixExpr.combine_infix(
            TextExpr.blank(),
            expr.extract_side_at(expr.split_at_index, 'right'),
            expr.operator_exprs[expr.split_at_index])];
      }
      else
        return [expr, TextExpr.blank()];
    case 'colon':
      if(expr.is_expr_type('infix') && expr.operator_text() === ':')
        return [
          expr.extract_side_at(expr.split_at_index, 'left'),
          expr.extract_side_at(expr.split_at_index, 'right')];
      else
        return [expr, TextExpr.blank()];
    case 'colon_if':
      if(expr.is_expr_type('infix') && expr.operator_text() === ':')
        return [
          expr.extract_side_at(expr.split_at_index, 'left'),
          Expr.combine_pair(
            Expr.combine_pair(
              FontExpr.roman_text('if'),
              new CommandExpr('enspace'), true),
            expr.extract_side_at(expr.split_at_index, 'right'), true)];
      else
        return [expr, FontExpr.roman_text('otherwise')];
    default:
      return [expr];
    }
  }

  expr_type() { return 'array'; }
  json_keys() { return ['array_type', 'row_count', 'column_count']; }

  is_matrix() {
    const t = this.array_type;
    // TODO: t.endsWith('matrix')?
    return (t === 'bmatrix' || t === 'Bmatrix' || t === 'matrix' ||
            t === 'pmatrix' || t === 'vmatrix' || t === 'Vmatrix');
  }

  // Return a copy of this expression but with a different array_type (e.g. 'pmatrix').
  // is_matrix() should be true before calling this.
  with_array_type(new_array_type) {
    return new ArrayExpr(
      new_array_type, this.row_count, this.column_count,
      this.element_exprs, this.row_separators, this.column_separators);
  }

  // Matrices are dissolved in row-major order.
  dissolve() {
    return [].concat(...this.element_exprs);
  }

  as_bold() {
    return new ArrayExpr(
      this.array_type,
      this.row_count,
      this.column_count,
      this.element_exprs.map(row_exprs => row_exprs.map(expr => expr.as_bold())),
      this.row_separators,
      this.column_separators);
  }

  to_json() {
    let json = super.to_json();
    json.element_exprs = this.element_exprs.map(
      row_exprs => row_exprs.map(expr => expr.to_json()));
    // Don't emit row/column separators if they are all turned off (to keep the JSON smaller).
    if(!this.row_separators.every(s => s === null))
      json.row_separators = this.row_separators;
    if(!this.column_separators.every(s => s === null))
      json.column_separators = this.column_separators;
    return json;
  }

  // Return a new ArrayExpr like this one, but with ellipses inserted before the
  // last row and column, and along the diagonal.
  // NOTE: is_matrix() should be true before calling this.
  // NOTE: this does not preserve column/row separators.  There's not really a
  // consistent way of doing this automatically.
  with_ellipses() {
    const make_cell = content => new CommandExpr(content);
    let new_row_count = this.row_count, new_column_count = this.column_count;
    let new_element_exprs;
    if(this.column_count > 1) {
      new_element_exprs = this.element_exprs.map((row_exprs, index) => [
        ...row_exprs.slice(0, -1),
        (index === 0 || index === this.row_count-1) ? make_cell('cdots') : TextExpr.blank(),
        row_exprs[this.column_count-1]
      ]);
      new_column_count++;
    }
    else
      new_element_exprs = [...this.element_exprs];
    if(this.row_count > 1) {
      let inserted_row_exprs = [make_cell('vdots')];
      for(let i = 0; i < this.column_count-2; i++)
        inserted_row_exprs.push(TextExpr.blank());
      if(this.column_count > 1)
        inserted_row_exprs.push(make_cell('ddots'), make_cell('vdots'));
      new_element_exprs.splice(this.row_count-1, 0, inserted_row_exprs);
      new_row_count++;
    }
    // TODO: preserve row/column separators
    return new ArrayExpr(this.array_type, new_row_count, new_column_count, new_element_exprs);
  }

  // Return a new ArrayExpr with rows and columns interchanged.
  // NOTE: is_matrix() should be true before calling this.
  transposed() {
    let new_element_exprs = [];
    for(let i = 0; i < this.column_count; i++)
      new_element_exprs.push(this.element_exprs.map(
        row_exprs => this._transpose_cell(row_exprs[i])));
    return new ArrayExpr(
      this.array_type, this.column_count, this.row_count, new_element_exprs,
      this.column_separators, this.row_separators);
  }

  // When transposing a matrix, we generally want to flip vertical and horizontal ellipses
  // within the cells.
  _transpose_cell(cell_expr) {
    if(cell_expr.is_expr_type('command') && cell_expr.operand_count() === 0) {
      if(cell_expr.command_name === 'vdots')
        return new CommandExpr('cdots');
      if(cell_expr.command_name === 'cdots')
        return new CommandExpr('vdots');
    }
    return cell_expr;
  }

  // Return an array of 1xN ArrayExprs, one for each row in this matrix.
  split_rows() {
    return this.element_exprs.map(
      row_exprs => new ArrayExpr(
        this.array_type, 1, this.column_count, [row_exprs],
        this.column_separators, null));
  }

  // Return a copy with a changed row or column separator at the specified location.
  // 'index'=0 means right after the first row or column.
  // 'index'=null means apply separators to ALL rows or columns.
  // 'type' is one of: [null, 'solid', 'dashed'].
  // If 'toggle' is true, that indicates that if the current separator is already
  // of the requested type, the separator will be turned off instead.
  with_separator(is_column, index, type, toggle) {
    const row_separators = [...this.row_separators];
    const column_separators = [...this.column_separators];
    const separators = is_column ? column_separators : row_separators;
    const size = is_column ? this.column_count : this.row_count;
    if(index === null) {
      if(toggle && separators.every(s => s === type))
        type = null;
      for(let i = 0; i < size-1; i++)
        separators[i] = type;
    }
    else {
      if(index < 0 || index >= size-1)
        return this;  // out of bounds
      if(toggle && separators[index] === type)
        type = null;
      separators[index] = type;
    }
    return new ArrayExpr(
      this.array_type, this.row_count, this.column_count, this.element_exprs,
      row_separators, column_separators);
  }

  emit_latex(emitter) {
    // Matrices with row or column separators require special handling in LaTeX.
    if(this.is_matrix() &&
       !(this.column_separators.every(s => s === null) &&
         this.row_separators.every(s => s === null)))
      return this._emit_array_with_separators(emitter);
    let subexpr_index = 0;
    if(this.array_type === 'substack')  // substack is a special case here
      emitter.text("\\substack{\n");
    else
      emitter.begin_environment(this.array_type);
    this.element_exprs.forEach((row_exprs, row_index) => {
      if(row_index > 0)
        emitter.row_separator();
      row_exprs.forEach((expr, col_index) => {
        if(col_index > 0) emitter.align_separator();
        if(expr) emitter.expr(expr, subexpr_index);  // should always be true
        subexpr_index++;
      });
    });
    if(this.array_type === 'substack')
      emitter.text('}');
    else
      emitter.end_environment(this.array_type);
  }

  // This is a matrix with at least one column separator specified.
  // Unfortunately, with LaTeX/KaTeX, the {array} environment has to be used
  // which doesn't support the surrounding matrix delimiters, so we have to
  // explicitly put out the delimiters here.  But this also throws off the matrix
  // spacing - \kern is used to compensate for that.  But the spacing after \kern
  // is too small to accomodate horizontal rules (row separators) so if those are
  // present, the (default) larger spacing is used.
  _emit_array_with_separators(emitter) {
    // Determine which delimiters to explicitly emit based on the matrix type.
    let left_delim = null, right_delim = null;
    switch(this.array_type) {
    case 'bmatrix': left_delim = '['; right_delim = ']'; break;
    case 'Bmatrix': left_delim = "\\{"; right_delim = "\\}"; break;
    case 'matrix': left_delim = null; right_delim = null; break;
    case 'pmatrix': left_delim = '('; right_delim = ')'; break;
    case 'vmatrix': left_delim = right_delim = '|'; break;
    case 'Vmatrix': left_delim = right_delim = "\\Vert"; break;
    default: break;
    }

    // Assemble the LaTeX column separator "specification" string
    // (the {c:c:c} part in: \begin{array}{c:c:c}).
    let pieces = ['{'];
    for(let i = 0; i < this.column_count; i++) {
      pieces.push('c');  // centered (only mode that's supported currently)
      if(i < this.column_count-1) {
        const s = this.column_separators[i];
        if(s === 'solid') pieces.push('|');
        else if(s === 'dashed') pieces.push(':');
      }
    }
    pieces.push('}');
    const column_layout_string = pieces.join('');

    if(left_delim) {
      emitter.command('left');
      emitter.text_or_command(left_delim);
    }
    const has_row_separators = !this.row_separators.every(s => s === null);
    if(!has_row_separators)
      emitter.text_or_command("\\kern-5pt");
    emitter.begin_environment('array', column_layout_string);
    let subexpr_index = 0;
    this.element_exprs.forEach((row_exprs, row_index) => {
      if(row_index > 0) {
        emitter.row_separator();
        const separator = this.row_separators[row_index-1];
        if(separator) {
          if(separator === 'solid') emitter.command('hline')
          else if(separator === 'dashed') emitter.command('hdashline');
          emitter.text("\n");
        }
      }
      row_exprs.forEach((expr, col_index) => {
        if(col_index > 0) emitter.align_separator();
        if(expr) emitter.expr(expr, subexpr_index);  // should always be true
        subexpr_index++;
      });
    });
    emitter.end_environment('array');
    if(!has_row_separators)
      emitter.text_or_command("\\kern-5pt");
    if(right_delim) {
      emitter.command('right');
      emitter.text_or_command(right_delim);
    }
  }

  visit(fn) {
    fn(this);
    this.element_exprs.forEach(
      row_exprs => row_exprs.forEach(expr => expr.visit(fn)));
  }

  subexpressions() {
    // Flatten element expressions in row-major order.
    return [].concat(...this.element_exprs);
  }

  replace_subexpression(index, new_expr) {
    const column = index % this.column_count;
    const row = Math.floor((index - column) / this.column_count);  // floor() is not strictly needed
    const new_element_exprs = this.element_exprs.map(
      (row_exprs, row_index) => row_exprs.map(
        (expr, col_index) => (row_index === row && col_index === column) ? new_expr : expr));
    return new ArrayExpr(
      this.array_type, this.row_count, this.column_count, new_element_exprs,
      this.row_separators, this.column_separators);
  }

  substitute_expr(old_expr, new_expr) {
    if(this === old_expr) return new_expr;
    const new_element_exprs = this.element_exprs.map(
      row_exprs => row_exprs.map(
        expr => expr.substitute_expr(old_expr, new_expr)));
    return new ArrayExpr(
      this.array_type, this.row_count, this.column_count, new_element_exprs,
      this.row_separators, this.column_separators);
  }
}


export {
  Expr, CommandExpr, FontExpr, InfixExpr, PostfixExpr,
  PlaceholderExpr, TextExpr, SequenceExpr,
  DelimiterExpr, SubscriptSuperscriptExpr,
  ArrayExpr
};
