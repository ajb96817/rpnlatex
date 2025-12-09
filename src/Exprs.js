
import {
  LatexEmitter, ExprPath
} from './Models';


// Abstract superclass for expression trees.
// Note that all operations on Exprs are non-destructive; new Expr instances
// are returned with changes rather than modifying internal state.
class Expr {
  // Concatenate two Exprs into one.  This will merge Exprs into adjacent
  // SequenceExprs when possible, instead of creating nested SequenceExprs.
  // Context-dependent autoparenthesization is done unless no_parenthesize is set.
  static concatenate(left, right, no_parenthesize = false) {
    // Concatenating something to a unary minus PrefixExpr converts
    // into an InfixExpr for subtraction: concat(x, -y) -> x-y
    if(right.is_prefix_expr() && right.is_unary_minus())
      return InfixExpr.combine_infix(left, right.base_expr, new TextExpr('-'));
    // Handle concatenating an expression to one or more ! signs, for factorial notation.
    // This notation has to be handled carefully:
    //   - The usual case is concatenating a base expression 'x' to a ! sign,
    //     yielding a PostfixExpr(x, '!').
    //   - Concatenating ! to ! should give a Sequence['!', '!'].
    //   - Concatenating a non-'!' expression to such a sequence should yield
    //     the double-factorial x!!, which is a nested PostfixExpr.
    //   - Any amount of ! symbols can be used, although only x! and x!! have meaning here.
    const factorial_count = expr => {
      // Count number of exclamation points, for both TextExprs and SequenceExprs.
      if(expr.is_text_expr_with('!'))
        return 1;
      else if(expr.is_sequence_expr() &&
              expr.exprs.every(
                subexpr => subexpr.is_text_expr_with('!')))
        return expr.exprs.length;
      else
        return 0;
    };
    const left_factorial_count = factorial_count(left);
    const right_factorial_count = factorial_count(right);
    if(right_factorial_count > 0) {
      if(left_factorial_count === 0) {
        // Concatenating a "normal" expression to 1 or more ! signs.
        return PostfixExpr.factorial_expr(left, right_factorial_count);
      }
      else {
        // Concatenating groups (1 or more) of ! signs together.
        return new SequenceExpr(
          new Array(
            left_factorial_count + right_factorial_count
          ).fill(new TextExpr('!')));
      }
    }
    // Some types of CommandExprs (integral signs) can be combined in special ways.
    if(left.is_command_expr() && right.is_command_expr()) {
      const combined_command_name = CommandExpr.combine_command_pair(
        left.command_name, right.command_name);
      if(combined_command_name)
        return new CommandExpr(combined_command_name);
    }
    // Special case: combine 123 456 => 123456 if both sides are numeric.
    // This can lead to things like "1.2" + "3.4" -> "1.23.4" but that's
    // considered OK because the main use for this is to build numbers from
    // individual digits.  The user should use an explicit \cdot or \times
    // infix operator to indicate multiplication.
    // TODO: convert '123' + '-456' into an infix subtraction
    if(left.is_text_expr() && left.looks_like_number() &&
       right.is_text_expr() && right.looks_like_number())
      return new TextExpr(left.text + right.text);
    // Parenthesization of factorial notation is a little tricky.
    // We want the results:
    //   2 x!      =>  2(x!)
    //   2 (x+1)!  =>  2(x+1)!  (so not parenthesizing the (x+1)! again)
    //   (x+1) y!  =>  (x+1)y!
    //   x! y!     =>  x!y!
    //   x! !      =>  x!!  (not (x!)!) - this is handled by the logic above
    const parenthesize_left = left.is_infix_expr() &&
          !left.is_differential_form() && !no_parenthesize;
    const left_expr = parenthesize_left ? DelimiterExpr.parenthesize(left) : left;
    let parenthesize_right = right.is_infix_expr() && !right.is_differential_form();
    if(right.is_postfix_expr() && right.factorial_signs_count() > 0) {
      if(!right.base_expr.is_delimiter_expr())
        parenthesize_right = true;  // handle 2(x!) and 2(x+1)!
      if(left.is_postfix_expr() && left.factorial_signs_count() > 0)
        parenthesize_right = false;  // x!y!
    }
    if(no_parenthesize)
      parenthesize_right = false;
    const right_expr = parenthesize_right ?
          DelimiterExpr.parenthesize(right) : right;
    // NOTE: At this point, left_expr and right_expr are the (possibly)
    // parenthesized versions of left/right.
    // Adjacent FontExprs of the same type can be merged into a single
    // FontExpr instead, e.g. \bold{AB} instead of \bold{A}\bold{B}
    // (This renders better in some cases.)
    // Note that applying a font after expressions are concatenated
    // will not do this merging.  AB -> bold -> \bold{A}\bold{B}.
    // This could be implemented if needed (by coalescing adjacent FontExprs
    // within a SequenceExpr).
    if(left_expr.is_font_expr() && right_expr.is_font_expr() &&
       FontExpr.font_exprs_compatible(left_expr, right_expr)) {
      // TODO: Maybe only do this if the FontExprs are wrapping TextExprs.
      return new FontExpr(
        this.concatenate(left_expr.expr, right_expr.expr, no_parenthesize),
        left_expr.typeface, left_expr.is_bold, left_expr.size_adjustment);
    }
    // Insert a thinspace when concatenating a differential form to anything
    // except an integral sign on the left.  This includes concatenating a
    // differential form on the right side of a SequenceExpr to something else,
    // for cases like \int dx\,x^2.
    const integral_on_left = (left_expr.is_command_expr() && left_expr.is_integral_sign()) ||
          (left_expr.is_sequence_expr() &&
           left_expr.last_expr().is_command_expr() &&
           left_expr.last_expr().is_integral_sign());
    const differential_form_on_left = left_expr.is_differential_form() ||
          (left_expr.is_sequence_expr() &&
           left_expr.last_expr().is_differential_form());
    const insert_thinspace =
          (differential_form_on_left ||
           right_expr.is_differential_form()) && !integral_on_left;
    // Combine left and right into a SequenceExpr, flattening existing sequences.
    // As a special case, don't flatten sequences representing simple differentials
    // ('dx') (these were originally treated as special "fused" sequences).
    let exprs = [];
    if(left_expr.is_sequence_expr() && !left_expr.is_differential_form())
      exprs.push(...left_expr.exprs);
    else exprs.push(left_expr);
    if(insert_thinspace)
      exprs.push(new CommandExpr(','));
    if(right_expr.is_sequence_expr() && !right_expr.is_differential_form())
      exprs.push(...right_expr.exprs);
    else exprs.push(right_expr);
    return new SequenceExpr(exprs);
  }

  // Combine two Exprs with the given conjunction phrase between them,
  // with largish spacing.
  // For example "X  iff  Y" as in the [,][F] command.
  // is_bold will make the conjunction phrase bolded.
  static combine_with_conjunction(left_expr, right_expr, phrase, is_bold) {
    const conjunction_expr = new SequenceExpr([
      new CommandExpr('quad'),
      new CommandExpr(
        is_bold ? 'textbf' : 'text',
        [new TextExpr(phrase)]),
      new CommandExpr('quad')]);
    return InfixExpr.combine_infix(left_expr, right_expr, conjunction_expr);
  }

  // "Parse" a roman_text string (via Shift+Enter from [\] math entry mode).
  // This just wraps the string in a roman typeface FontExpr; but if
  // the string contains [] sequences, those are converted into placeholders
  // and the resulting Expr is a SequenceExpr with a mixture of FontExprs
  // (for the text pieces) and PlaceholderExprs.
  static roman_text_to_expr(string) {
    const pieces = string.split('[]');
    let exprs = [];
    for(const [i, piece] of pieces.entries()) {
      if(piece.length > 0)
        exprs.push(FontExpr.roman_text(piece));
      if(i < pieces.length-1)
        exprs.push(new PlaceholderExpr());
    }
    if(exprs.length === 0)
      return FontExpr.roman_text('');  // special case: 'string' is empty
    else if(exprs.length === 1)
      return exprs[0];
    else
      return new SequenceExpr(exprs);
  }

  // Convert a string into a TextExpr, or a CommandExpr if it begins
  // with \ (i.e. a latex command).
  static text_or_command(s) {
    if(s.startsWith("\\"))
      return new CommandExpr(s.slice(1));
    else
      return new TextExpr(s);
  }
  
  expr_type() { return '???'; }  // subclasses override

  is_command_expr() { return this.expr_type() === 'command'; }
  is_font_expr() { return this.expr_type() === 'font'; }
  is_infix_expr() { return this.expr_type() === 'infix'; }
  is_prefix_expr() { return this.expr_type() === 'prefix'; }
  is_postfix_expr() { return this.expr_type() === 'postfix'; }
  is_function_call_expr() { return this.expr_type() === 'function_call'; }
  is_placeholder_expr() { return this.expr_type() === 'placeholder'; }
  is_text_expr() { return this.expr_type() === 'text'; }
  is_sequence_expr() { return this.expr_type() === 'sequence'; }
  is_delimiter_expr() { return this.expr_type() === 'delimiter'; }
  is_subscriptsuperscript_expr() { return this.expr_type() === 'subscriptsuperscript'; }
  is_array_expr() { return this.expr_type() === 'array'; }
  is_tensor_expr() { return this.expr_type() === 'tensor'; }
  is_matrix_expr() { return this.is_array_expr() && this.is_matrix(); }
  is_text_expr_with(text) { return this.is_text_expr() && this.text === text; }
  is_text_expr_with_number() { return this.is_text_expr() && this.looks_like_number(); }
  is_unary_minus_expr() { return this.is_prefix_expr() && this.is_unary_minus(); }
  is_command_expr_with(operand_count, command_name /* optional */) {
    return this.is_command_expr() &&
      this.operand_count() === operand_count &&
      (command_name === undefined || this.command_name === command_name);
  }

  // Check for 'dx', 'dx ^ dy', etc.
  is_differential_form() { return false; }

  to_latex(selected_expr_path, export_mode) {
    let emitter = new LatexEmitter(this, selected_expr_path);
    emitter.export_mode = export_mode;
    emitter.expr(this, null);
    return emitter.finished_string();
  }

  emit_latex(emitter) { emitter.text('INVALID'); }

  // Try to convert this Expr into a string for use in math entry mode.
  // The string should be something that will recreate this Expr when parsed.
  // Generally, we use the source_string from the ExprItem wrapping this Expr
  // if available (i.e., the math entry mode input originally used), and only
  // if that's not available is this method tried instead.  Currently only
  // some simple Expr types will convert to editable strings.
  as_editable_string() { return null; }

  // Return a list of all immediate subexpressions of this one, in (at least approximate)
  // left-to-right order.
  subexpressions() { return []; }

  // True if this has any subexpressions to descend into via ExprPath.
  // As a special case, FontExprs that represent font commands peek into
  // their arguments (recursively) to determine this.  This is to prevent
  // selecting "inside" font commands (with dissect mode) that only wrap a
  // simple leaf expression.  This means that has_subexpressions() may
  // sometimes return false even if subexpressions() is nonempty.
  has_subexpressions() { return this.subexpressions().length > 0; }

  // Return a new Expr like this one but with the subexpression at the given index replaced
  // with a new one.  The subexpression indexes here correspond to what is returned by subexpressions().
  replace_subexpression(/* index, new_expr */) { return this; }

  // Check if this Expr "matches" another Expr (i.e., has the same visual content).
  // Subclasses can extend this to match additional fields that aren't just subexpressions
  // (such as the delimiter type in DelimiterExpr).
  matches(expr) {
    if(this === expr) return true;
    if(this.expr_type() !== expr.expr_type()) return false;
    if(this.has_subexpressions() !== expr.has_subexpressions()) return false;
    const [this_subexpressions, expr_subexpressions] =
          [this.subexpressions(), expr.subexpressions()];
    if(this_subexpressions.length !== expr_subexpressions.length) return false;
    return this_subexpressions.every((this_subexpression, i) =>
      this_subexpression.matches(expr_subexpressions[i]));
  }

  // Substitute anything matching 'search_expr' with 'substitution_expr'.
  // NOTE: This can potentially create expressions that are nested internally
  // in a way they ordinarily wouldn't be.  For example: (x+y).substitute(y, z+w)
  // creates a nested Infix(Infix(x, +, Infix(z, +, w)), which would normally
  // be Infix(x, +, z, +, w).  This shouldn't be a problem in practice though.
  substitute(search_expr, substitution_expr) {
    if(this.matches(search_expr))
      return substitution_expr;
    let result = this;
    for(const [index, subexpr] of this.subexpressions().entries()) {
      const new_subexpr = subexpr.substitute(search_expr, substitution_expr);
      if(new_subexpr !== subexpr)
        result = result.replace_subexpression(index, new_subexpr);
    }
    return result;
  }

  // Return an ExprPath to the first PlaceholderExpr within this Expr-tree,
  // or null if there is none.
  find_placeholder_expr_path() {
    return this._find_placeholder_expr_path(new ExprPath(this, []));
  }
  _find_placeholder_expr_path(expr_path) {
    let found_expr_path = null;
    for(const [index, subexpr] of this.subexpressions().entries())
      if(found_expr_path === null)
        found_expr_path = subexpr._find_placeholder_expr_path(
          expr_path.descend(index));
    return found_expr_path;
  }

  // "Dissolve" this expression into its component parts as appropriate.
  // Returns an array of the Expr components.
  dissolve() { return [this]; }

  // Subclasses can override.
  as_bold() {
    return FontExpr.wrap(this)
      .with_bold(true).unwrap_if_possible();
  }

  // Return the "logical negation" of this expression, if it makes
  // sense (e.g. turning '=' into '!=' or vice-versa).
  // Null is returned if negation doesn't have a clear meaning for
  // this expression.  Subclasses override this to do various things:
  //   - TextExprs representing comparison operators like '=' or '<'
  //     convert into CommandExprs like \neq or \nless.
  //   - CommandExprs like \nless can convert back into TextExpr('<').
  //   - Other CommandExprs like \subset are "negated" by prepending a \not
  //     command (resulting in a SequenceExpr).
  //   - SequenceExprs like \not\subset turn back into \subset.
  //   - InfixExprs try to negate the operator at their split_at_index
  //     (e.g. x = y  =>  x != y).
  //   - PrefixExprs try to negate their prefix operator (=x  =>  !=x).
  as_logical_negation() { return null; }

  with_subscript(subscript_expr, autoparenthesize = true) {
    return this.with_subscript_or_superscript(
      subscript_expr, true, autoparenthesize);
  }

  with_superscript(superscript_expr, autoparenthesize = true) {
    return this.with_subscript_or_superscript(
      superscript_expr, false, autoparenthesize);
  }

  // NOTE: SubscriptSuperscriptExpr overrides this so expressions with
  // both subscripts and superscripts are "packed" into the same
  // SubscriptSuperscriptExpr.
  with_subscript_or_superscript(expr, is_subscript, autoparenthesize = true) {
    if(expr)
      return new SubscriptSuperscriptExpr(
        autoparenthesize ?
          DelimiterExpr.parenthesize_for_power(this) : this,
        is_subscript ? expr : null,
        is_subscript ? null : expr);
    else {
      // "Removing" the (nonexistent) subscript or superscript.
      // This is for compatibility with passing expr=null for
      // the SubscriptSuperscriptExpr version.
      return this;
    }
  }

  // Add a \prime superscript to this Expr.
  // SubscriptSuperscriptExpr overrides this to handle the case of multiple
  // \primes attached to the same Expr, which should be rendered as:
  // x^{\prime\prime\prime}.
  with_prime(autoparenthesize) {
    return this.with_superscript(new CommandExpr('prime'), autoparenthesize);
  }
}


// Represents a LaTeX command such as \sqrt or \frac{x}{y}.
class CommandExpr extends Expr {
  static frac(numer_expr, denom_expr) {
    return new this('frac', [numer_expr, denom_expr]);
  }
  
  // Try to combine integral signs together; \int + \int -> \iint, etc.
  static combine_command_pair(left_command, right_command) {
    if(left_command === 'int' && right_command === 'int') return 'iint';
    if(left_command === 'iint' && right_command === 'int') return 'iiint';
    if(left_command === 'int' && right_command === 'iint') return 'iiint';
    if(left_command === 'oint' && right_command === 'oint') return 'oiint';
    if(left_command === 'oiint' && right_command === 'oint') return 'oiiint';
    if(left_command === 'oint' && right_command === 'oiint') return 'oiiint';
    return null;
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

  expr_type() { return 'command'; }

  operand_count() { return this.operand_exprs.length; }

  // "Special" LaTeX commands like \& and \%.  (Anything not starting with a letter.)
  // These need a little extra handling.  In particular, editing one of them as text
  // should use the normal math-entry mode & or % representation, instead of switching
  // to the LaTeX math-entry mode as would be done for a normal command like \alpha.
  is_special_latex_command() {
    return !/^[a-zA-Z]/.test(this.command_name);
  }

  emit_latex(emitter) {
    if(this.is_command_expr_with(2, 'atop')) {
      // \atop is a special case.  It needs to be written as
      // {left_expr \atop right_expr} instead of \atop{left_expr}{right_expr}.
      emitter.grouped(() => {
        emitter.expr(this.operand_exprs[0], 0);
        emitter.command(this.command_name);
        emitter.expr(this.operand_exprs[1], 1);
      }, 'force');
    }
    else {
      if(this.command_name !== '')
        emitter.command(this.command_name, this.options);
      // Braces need to be forced around each operand, even single-letter operands.
      for(const [index, operand_expr] of this.operand_exprs.entries())
        emitter.grouped_expr(operand_expr, 'force', index);
    }
  }

  subexpressions() { return this.operand_exprs; }

  matches(expr) {
    return super.matches(expr) &&
      this.command_name === expr.command_name &&
      this.options === expr.options;
  }

  replace_subexpression(index, new_expr) {
    return new CommandExpr(
      this.command_name,
      this.operand_exprs.map(
        (operand_expr, op_index) => op_index === index ? new_expr : operand_expr),
      this.options);
  }

  as_editable_string() {
    // Check for \operatorname{...} with a TextExpr inside.
    // This may have been created with [Tab] from math entry mode.
    if(this.is_command_expr_with(1, 'operatorname') &&
       this.operand_exprs[0].is_text_expr())
      return this.operand_exprs[0].text;
    else
      return null;
  }

  is_integral_sign() {
    return this.operand_count() === 0 &&
      ['int', 'iint', 'iiint', 'oint', 'oiint', 'oiiint'
      ].includes(this.command_name);
  }

  as_logical_negation() {
    if(this.operand_count() === 0) {
      // Check some special cases that have TextExpr counterparts.
      let text = null;
      switch(this.command_name) {
      case 'nless': text = '<'; break;
      case 'ngtr': text = '>'; break;
      case 'neq': case 'ne': text = '='; break;
      }
      if(text) return new TextExpr(text);
      // Check CommandExpr->CommandExpr special cases.
      switch(this.command_name) {
      case 'lt': text = 'nless'; break;
      case 'gt': text = 'ngtr'; break;
      case 'le': text = 'nleq'; break;
      case 'ge': text = 'ngeq'; break;
      case 'nleq': text = 'le'; break;
      case 'ngeq': text = 'ge'; break;
      case 'in': text = 'notin'; break;
      case 'notin': text = 'in'; break;
      case 'exists': text = 'nexists'; break;
      case 'nexists': text = 'exists'; break;
      }
      if(text) return new CommandExpr(text);
      // Default case: \subset => \not\subset
      return new SequenceExpr([new CommandExpr('not'), this]);
    }
    else
      return super.as_logical_negation();
  }

  // 0-argument commands are left as-is (\alpha, etc)
  // 1-argument commands dissolve into their only argument.
  // 2-argument \frac breaks into numerator and denominator.
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
      else
        return [this];
    default:
      return [this];
    }
  }
}


// FontExpr wraps another Expr and adds typeface/font information to it.
// A FontExpr sets both the overall typeface (normal math, upright roman, etc)
// and a flag indicating bold/normal, plus an optional size adjustment.
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
    if(expr.is_font_expr())
      return expr;
    else
      return new this(expr, 'normal', false, 0);
  }

  // Wrap 'expr' in a Roman typeface FontExpr.
  static roman(expr) {
    return this.wrap(expr).with_typeface('roman');
  }

  static roman_text(str) {
    return this.roman(new TextExpr(LatexEmitter.latex_escape(str)));
  }

  // Return true when the two expressions are both FontExprs with the same font parameters.
  static font_exprs_compatible(left_expr, right_expr) {
    return left_expr.is_font_expr() && right_expr.is_font_expr() &&
      left_expr.typeface === right_expr.typeface &&
      left_expr.is_bold === right_expr.is_bold &&
      left_expr.size_adjustment === right_expr.size_adjustment;
  }

  expr_type() { return 'font'; }

  // See comment in Expr.has_subexpressions().
  has_subexpressions() { return this.expr.has_subexpressions(); }
  subexpressions() { return [this.expr]; }

  replace_subexpression(index, new_expr) {
    // 'index' is always 0.
    return new FontExpr(new_expr, this.typeface, this.is_bold, this.size_adjustment);
  }

  matches(expr) {
    return super.matches(expr) &&
      FontExpr.font_exprs_compatible(this, expr);
  }

  // "Special" typefaces like calligraphic are considered uneditable
  // (e.g., as created by [&][c]).
  // Otherwise, the font changes (including bold and size-adjustment)
  // are stripped out and the base expression is used.
  as_editable_string() {
    if(['blackboard', 'calligraphic', 'script' /* , 'fraktur' is ok */
       ].includes(this.typeface))
      return null;
    else
      return this.expr.as_editable_string();
  }

  dissolve() { return [this.expr]; }

  // If this FontExpr is a "no-op", remove it by returning the wrapped expression directly.
  unwrap_if_possible() {
    if(this.typeface === 'normal' && !this.is_bold && this.size_adjustment === 0)
      return this.expr;
    else
      return this;
  }
  
  with_typeface(typeface) {
    return new FontExpr(this.expr, typeface, this.is_bold, this.size_adjustment);
  }

  with_bold(is_bold = true) {
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
    const size_adjustment_command =
          this.size_adjustment_command(this.size_adjustment);
    if(size_adjustment_command)  {
      // Size commands are stateful, so they need to be enclosed in their own group
      // so that the size adjustment does not continue beyond this expression.
      // i.e.: {\large ...} instead of \large{...}
      return emitter.grouped(() => {
        emitter.command(size_adjustment_command);
        this.with_size_adjustment(0).emit_latex(emitter);
      }, 'force');
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
        emitter.grouped_expr(this.expr, 'force', 0);
      }, 'force');
    }
    else {
      // either \pmb{...} or \typeface_cmd{...} (not both)
      emitter.command(use_pmb ? 'pmb' : typeface_command);
      emitter.grouped_expr(this.expr, 'force', 0);
    }
  }

  size_adjustment_command(size_adjustment) {
    // NOTE: -4 <= size_adjustment <= 5
    return [
      'tiny', 'scriptsize', 'footnotesize', 'small', null /* \normalsize */,
      'large', 'Large', 'LARGE', 'huge', 'Huge'
    ][size_adjustment+4];
  }

  // Returns true if the given typeface's bold variant should be rendered using \pmb
  // (poor man's bold) on top of the non-bolded version (instead of using a dedicated
  // command like \boldsymbol).
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
//
// NOTE: Infix expressions are "flat", unless terms are explicitly parenthesized.
// 'x + y * z' is a three-term expression, rather than being a tree structure
// like x + (y * z).  Operator precedence and associativity are not handled here.
//
// operand_exprs: The x,y,z in 'x + y - z'.  There must be at least 2.
// operator_exprs: The +,- in 'x + y - z'.  Length must be 1 less than operand_exprs.
// split_at_index: Index of the operator_expr that is considered the 'split point'
//   for this InfixExpr.  Generally this is the last operator used to create the
//   infix expression.  For binary expressions this is 0; for something like 'x+y = z+w'
//   it would be 1 if the '=' was used to join the existing x+y and z+w.
// linebreaks_at: An array of integers specifying where (if any) the linebreaks
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
  static combine_infix(left_expr, right_expr, op_expr, check_special_cases = true) {
    if(check_special_cases) {
      // We want x + -y => x - y.
      if(op_expr.is_text_expr_with('+'))
         return this.add_exprs(left_expr, right_expr);
    }
    let new_operand_exprs = [];
    let new_operator_exprs = [];
    let new_linebreaks_at = [];
    let linebreaks_midpoint = null;
    if(left_expr.is_infix_expr()) {
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
    if(right_expr.is_infix_expr()) {
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

  // Combine all exprs using the same op_expr between each term
  // (x + y + z) with left associativity.
  static combine_infix_all(exprs, op_expr) {
    if(exprs.length === 0)
      return TextExpr.blank();
    return exprs.reduce((infix_expr, expr) =>
      this.combine_infix(infix_expr, expr, op_expr));
  }

  // Combining with infix + has some special cases that should be
  // handled if combining x+y where y involves a prefix unary minus.
  // TODO: Maybe have subtract_exprs() as well.  That's not the same
  // though, since we want to have x - ((-y) - z) => x + y + z,
  // and it's "better" to just parenthesize: x - (-y - z).
  static add_exprs(left_expr, right_expr) {
    if(right_expr.is_unary_minus_expr()) {
      // x + (-y) => x - y
      return this.combine_infix(
        left_expr, right_expr.base_expr,
        new TextExpr('-'), false);
    }
    else if(right_expr.is_infix_expr() &&
            right_expr.operand_exprs[0].is_unary_minus_expr() &&
            (right_expr.operator_exprs[0].is_text_expr_with('+') ||
             right_expr.operator_exprs[0].is_text_expr_with('-'))) {
      // Adding left_expr (which can be anything) to an InfixExpr where the first
      // term is negated and then combined to something else with + or -:
      //   x + (-y + z) => x - y + z
      //   x + (-y - z) => x - y - z
      // (but x + (-y / z) stays as is).
      return this.combine_infix(
        left_expr, new InfixExpr(
          [right_expr.operand_exprs[0].base_expr,
           ...right_expr.operand_exprs.slice(1)],
          right_expr.operator_exprs,
          right_expr.split_at_index,
          right_expr.linebreaks_at),
        new TextExpr('-'), false);
    }
    else if(right_expr.is_sequence_expr() &&
            right_expr.exprs.length >= 2 &&
            right_expr.exprs[0].is_unary_minus_expr()) {
      // Adding left_expr to a SequenceExpr where the first term is negated.
      return this.combine_infix(
        left_expr,
        new SequenceExpr([
          right_expr.exprs[0].base_expr,
          ...right_expr.exprs.slice(1)]),
        new TextExpr('-'), false);
    }
    else
      return this.combine_infix(
        left_expr, right_expr,
        new TextExpr('+'), false);
  }

  expr_type() { return 'infix'; }

  // If the given infix operator is a simple command like '+' or '\cap',
  // return the command name (without the initial \ if it has one).
  // If it's anything more complex, return null.
  // If 'op_expr' is omitted, check only the operator at the split_at point.
  operator_text(op_expr) {
    op_expr ||= this.operator_exprs[this.split_at_index];
    if(op_expr.is_command_expr_with(0))
      return op_expr.command_name;
    else if(op_expr.is_text_expr())
      return op_expr.text;
    else
      return null;
  }

  operator_text_at(index) {
    return this.operator_text(this.operator_exprs[index]);
  }

  // Check if this is a "low-precedence" infix expression like x+y.
  // This determines if things like x - expr should convert to
  // x - (expr) or not.
  needs_autoparenthesization() {
    // TODO: maybe \oplus, \ominus, \pm, \mp
    return this.operator_exprs.some(op_expr =>
      op_expr.is_unary_minus_expr() ||
        op_expr.is_text_expr_with('+') ||
        op_expr.is_text_expr_with('-'));
  }

  // Expressions like dx \wedge dy.
  is_differential_form() {
    return this.operator_exprs.every(operator_expr =>
      operator_expr.is_command_expr_with(0, 'wedge')) &&
      this.operand_exprs.every(operand_expr => operand_expr.is_differential_form());
  }

  // 'inside_delimiters' is set to true when this InfixExpr is rendered
  // as the inner_expr of a DelimiterExpr.
  // This gives us a chance to convert things like \parallel into
  // their flexible \middle counterparts.
  emit_latex(emitter, inside_delimiters) {
    const is_top_level = this === emitter.base_expr;
    for(let i = 0; i < this.operator_exprs.length; i++) {
      emitter.expr(this.operand_exprs[i], 2*i);
      if(is_top_level && this.linebreaks_at.includes(2*i)) {
        // Break before ith operator.
        emitter.command("\\");  // outputs two backslashes (LaTeX newline command)
        emitter.command('qquad');
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
        emitter.command('qquad');
      }
    }
    emitter.expr(
      this.operand_exprs[this.operand_exprs.length-1],
      2*this.operator_exprs.length);
  }

  _convert_to_flex_delimiter(expr) {
    let new_text = null;
    if(expr.is_text_expr_with('/'))
      new_text = "\\middle/";
    else if(expr.is_command_expr_with(0)) {
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

  // Swap everything to the left of operator_index with everything
  // to the right of operator_index.
  swap_sides_at(operator_index) {
    const new_operand_exprs = this.operand_exprs
          .slice(operator_index+1)
          .concat(this.operand_exprs.slice(0, operator_index+1));
    const new_operator_exprs = this.operator_exprs
          .slice(operator_index+1)
          .concat(
            [this.operator_exprs[operator_index]],
            this.operator_exprs.slice(0, operator_index));
    // NOTE: linebreaks_at is discarded here, otherwise the result
    // isn't very intuitive.
    return new InfixExpr(
      new_operand_exprs, new_operator_exprs,
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

  as_logical_negation() {
    // Try to negate the split_at operator.
    const negated_operator_expr =
          this.operator_exprs[this.split_at_index].as_logical_negation();
    if(negated_operator_expr) {
      let new_operator_exprs = [...this.operator_exprs];
      new_operator_exprs[this.split_at_index] = negated_operator_expr;
      return new InfixExpr(
        this.operand_exprs,
        new_operator_exprs,
        this.split_at_index,
        this.linebreaks_at);
    }
    else
      return super.as_logical_negation();
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
}


// Represents a "placeholder marker" that can be used with the
// 'substitute_placeholder' command.
class PlaceholderExpr extends Expr {
  expr_type() { return 'placeholder'; }

  emit_latex(emitter) {
    if(emitter.export_mode)
      emitter.expr(new TextExpr("\\blacksquare"), null);
    else
      emitter.expr(
        new CommandExpr('htmlClass', [
          new TextExpr('placeholder_expr'),
          new TextExpr("\\blacksquare")]),
        null);
  }

  as_editable_string() { return '[]'; }

  // NOTE: overrides superclass method
  _find_placeholder_expr_path(expr_path) { return expr_path; }
}


// Prefixed unary expressions such as: +x, -x, \neg x
class PrefixExpr extends Expr {
  static unary_minus(expr) {
    return new this(expr, new TextExpr('-'));
  }

  constructor(base_expr, operator_expr) {
    super();
    this.base_expr = base_expr;
    this.operator_expr = operator_expr;
  }

  expr_type() { return 'prefix'; }

  emit_latex(emitter) {
    emitter.expr(this.operator_expr, 0);
    emitter.expr(this.base_expr, 1);
  }

  has_subexpressions() { return true; }
  subexpressions() { return [this.operator_expr, this.base_expr]; }

  operator_text() {
    if(this.operator_expr.is_text_expr())
      return this.operator_expr.text;
    else if(this.operator_expr.is_command_expr_with(0))
      return this.operator_expr.command_name;
    else
      return '';  // shouldn't happen
  }

  is_unary_minus() { return this.operator_text() === '-'; }

  replace_subexpression(index, new_expr) {
    return new PrefixExpr(
      index === 1 ? new_expr : this.base_expr,
      index === 0 ? new_expr : this.operator_expr);
  }

  as_editable_string() {
    const operator_string = this.operator_expr.as_editable_string();
    const base_string = this.base_expr.as_editable_string();
    if(base_string && operator_string)
      return [operator_string, base_string].join('');
    else return null;
  }

  as_logical_negation() {
    const negated_operator_expr =
          this.operator_expr.as_logical_negation();
    if(negated_operator_expr)
      return new PrefixExpr(this.base_expr, negated_operator_expr);
    else
      return super.as_logical_negation();
  }

  dissolve() { return this.subexpressions(); }

  as_bold() {
    // Don't bold the operator (analogous to what InfixExpr does).
    return new PrefixExpr(
      this.base_expr.as_bold(),
      this.operator_expr);
  }
}


// Represents a postfix operation where the operator comes after the operand.
// Currently this is only used for factorial and double-factorial notation.
// Potentially this could be used for things like transpose and conjugate, but
// those are currently treated as SubscriptSuperscriptExprs.
// The main use case for PostfixExpr currently is for representing things
// like '3!4!' (= 144) which would otherwise be a SequenceExpr['3', '!', '4', '!'].
// NOTE: Double factorials (x!!) are actually represented as
//       PostfixExpr(PostfixExpr(x, '!'), '!') instead of PostfixExpr(x, '!!').
class PostfixExpr extends Expr {
  // Create a factorial expression with 'factorial_depth' exclamation points.
  static factorial_expr(base_expr, factorial_depth) {
    return this._factorial_expr(
      // Parenthesization: we want (x+1)! but not (x!)!
      base_expr.is_postfix_expr() ? base_expr :
        DelimiterExpr.parenthesize_for_power(base_expr),
      factorial_depth);
  }
  static _factorial_expr(base_expr, factorial_depth) {
    if(factorial_depth > 1)
      base_expr = PostfixExpr._factorial_expr(base_expr, factorial_depth-1);
    return new this(base_expr, new TextExpr('!'));
  }

  constructor(base_expr, operator_expr) {
    super();
    this.base_expr = base_expr;
    this.operator_expr = operator_expr;
  }

  expr_type() { return 'postfix'; }

  emit_latex(emitter) {
    emitter.expr(this.base_expr, 0);
    emitter.expr(this.operator_expr, 1);
  }

  has_subexpressions() { return true; }
  subexpressions() { return [this.base_expr, this.operator_expr]; }

  replace_subexpression(index, new_expr) {
    return new PostfixExpr(
      index === 0 ? new_expr : this.base_expr,
      index === 1 ? new_expr : this.operator_expr);
  }

  as_editable_string() {
    const base_string = this.base_expr.as_editable_string();
    const operator_string = this.operator_expr.as_editable_string();
    if(base_string && operator_string)
      return [base_string, operator_string].join('');
    else return null;
  }

  dissolve() { return this.subexpressions(); }

  as_bold() {
    // Unlike Infix/PrefixExpr, the postfix operator is also bolded here.
    // This is mainly because '!' is not exactly a normal operator, but
    // more like a concatenation like 'x!'.
    // NOTE: It's possible to create PostfixExprs with other operators,
    // for example by swapping a unary minus PrefixExpr with [/][w].
    // In that case, the operator is not bolded, for consistency with
    // PrefixExpr.
    return new PostfixExpr(
      this.base_expr.as_bold(),
      this.operator_expr.is_text_expr_with('!') ?
        this.operator_expr.as_bold() : this.operator_expr);
  }

  // Factorial expressions with multiple ! signs are represented as nested
  // PostfixExprs with single-! operators.  For example:
  //   x!!! = Postfix(Postfix(Postfix(x, '!'), '!'), '!')
  // Return [base_expr, factorial_signs_count], where base_expr is the innermost 'x'
  // and factorial_signs_count is the number of nested factorial signs (3 in this case).
  // Non-factorial postfix expressions will return factorial_signs_count=0.
  analyze_factorial() {
    let [base_expr, factorial_signs_count] = [this.base_expr, 0];
    if(this.operator_expr.is_text_expr_with('!')) {
      if(this.base_expr.is_postfix_expr())
        [base_expr, factorial_signs_count] = base_expr.analyze_factorial();
      factorial_signs_count++;
    }
    return [base_expr, factorial_signs_count];
  }

  factorial_signs_count() { return this.analyze_factorial()[1]; }
}


// Represents a function call like: f(x,y,z)
// Here fn_expr = f, args_expr = (x,y,z).
// Note that "operator-style" functions like 'sin x' use CommandExpr, not this.
class FunctionCallExpr extends Expr {
  constructor(fn_expr, args_expr) {
    super();
    this.fn_expr = fn_expr;
    this.args_expr = args_expr;  // should be a DelimiterExpr
  }

  expr_type() { return 'function_call'; }

  emit_latex(emitter) {
    // The args_expr gets wrapped in an "empty" latex command
    // (i.e. a set of braces).  f(x) becomes f{(x)}.
    // This has the effect of tightening
    // the spacing after f to better match normal function notation.
    emitter.expr(this.fn_expr, 0);
    emitter.grouped_expr(this.args_expr, 'force', 1);
  }

  has_subexpressions() { return true; }
  subexpressions() { return [this.fn_expr, this.args_expr]; }

  replace_subexpression(index, new_expr) {
    return new FunctionCallExpr(
      index === 0 ? new_expr : this.fn_expr,
      index === 1 ? new_expr : this.args_expr);
  }

  dissolve() {
    // TODO: maybe 'dissolve' the args_expr DelimiterExpr too
    return this.subexpressions();
  }

  as_bold() {
    // f(x) -> bolded f and x, but not the parentheses themselves.
    // Bolding the parentheses themselves might be considered desirable
    // instead of this, in which case bold_args_expr = this.args_expr.as_bold().
    const bold_args_expr =
        this.args_expr.is_delimiter_expr() ?
        this.args_expr.replace_subexpression(0, this.args_expr.inner_expr.as_bold()) :
        this.args_expr.as_bold();
    return new FunctionCallExpr(this.fn_expr.as_bold(), bold_args_expr);
  }

  // Return an array of individual function arguments.
  // Something like f(x+y,z-w) returns [x+y, z-w].
  // TODO: maybe consider ';' as an argument separator as well as ','.
  extract_argument_exprs() {
    if(!this.args_expr.is_delimiter_expr())
      return [];  // shouldn't normally happen
    const inner_args_expr = this.args_expr.inner_expr;
    if(!inner_args_expr.is_infix_expr())
      return [inner_args_expr];  // single argument
    // Break up the InfixExpr into pieces according to where the commas are.
    // These pieces may be other InfixExprs, or something else, e.g.:
    //   f(x+y,z) => [x+y, z] (only the first is an InfixExpr).
    let argument_exprs = [];
    let argument_expr = inner_args_expr.operand_exprs[0];
    for(const [i, operator_expr]
        of inner_args_expr.operator_exprs.entries()) {
      if(operator_expr.is_text_expr_with(',')) {
        argument_exprs.push(argument_expr);
        argument_expr = inner_args_expr.operand_exprs[i+1];
      }
      else argument_expr = InfixExpr.combine_infix(
        argument_expr, inner_args_expr.operand_exprs[i+1],
        operator_expr);
    }
    argument_exprs.push(argument_expr);
    return argument_exprs;
  }

  argument_count() {
    return this.extract_argument_exprs().length;
  }
}


// Represents a snippet of LaTeX source text.
class TextExpr extends Expr {
  static blank() { return new this(''); }

  // Generally, we want to make sure negative numbers are
  // represented with PrefixExpr rather than a TextExpr('-123').
  static integer(int_or_str) {
    const s = int_or_str.toString();
    if(s.startsWith('-'))
      return PrefixExpr.unary_minus(new this(s.slice(1)));
    else
      return new this(s);
  }
  
  constructor(text) {
    super();
    this.text = text;
  }

  expr_type() { return 'text'; }

  emit_latex(emitter) {
    if(this.text === '') {
      // An "empty" TextExpr is a special case, emitted as an empty LaTeX group {}.
      // For example: -x is unary minus, but {}-x is "something" minus x.
      // The spacing is larger in the latter case.
      emitter.grouped(() => null, 'force');
    }
    else {
      // Check explicitly for '-123'.  These need to be enclosed in
      // a LaTeX group to get the proper spacing in things like x+-3.
      // Normally this doesn't occur because negative numbers should
      // use PrefixExpr.
      emitter.text(this.text, this.looks_like_negative_number());
    }
  }

  matches(expr) {
    return super.matches(expr) && this.text === expr.text;
  }

  as_editable_string() {
    return LatexEmitter.latex_unescape(this.text);
  }

  as_logical_negation() {
    // Some TextExpr comparison operators have explicit
    // 'not' LaTeX command counterparts.
    let command = null;
    switch(this.text) {
    case '<': command = 'nless'; break;
    case '>': command = 'ngtr'; break;
    case '=': command = 'neq'; break;
    }
    if(command)
      return new CommandExpr(command);
    else
      return super.as_logical_negation();
  }

  looks_like_number() { return /^-?\d*\.?\d+$/.test(this.text); }
  looks_like_floating_point() { return !isNaN(parseFloat(this.text)); }
  looks_like_negative_number() { return /^-\d*\.?\d+$/.test(this.text); }
}


// Represents a sequence of expressions all concatenated together.
class SequenceExpr extends Expr {
  constructor(exprs) {
    super();
    this.exprs = exprs;
  }

  expr_type() { return 'sequence'; }

  emit_latex(emitter) {
    for(const [index, expr] of this.exprs.entries())
      emitter.expr(expr, index);
  }

  subexpressions() { return this.exprs; }

  last_expr() { return this.exprs[this.exprs.length-1]; }

  replace_subexpression(index, new_expr) {
    return new SequenceExpr(
      this.exprs.map(
        (subexpr, subexpr_index) => subexpr_index === index ? new_expr : subexpr));
  }

  dissolve() { return this.exprs; }

  as_bold() {
    return new SequenceExpr(this.exprs.map(expr => expr.as_bold()));
  }

  as_logical_negation() {
    if(this.exprs.length === 2 &&
       this.exprs[0].is_command_expr_with(0, 'not'))
      return this.exprs[1];  // \not\le -> \le
    else
      return super.as_logical_negation();
  }

  // 'dx', etc.  The 'd' may be in a roman font.
  // 'd^2 x' etc. also count as differential forms.
  is_differential_form() {
    if(this.exprs.length !== 2) return false;
    let d_expr = this.exprs[0];
    if(d_expr.is_subscriptsuperscript_expr() &&
       d_expr.superscript_expr &&
       d_expr.superscript_expr.is_text_expr())
      d_expr = d_expr.base_expr;
    if(d_expr.is_text_expr_with('d')) return true;
    if(d_expr.is_font_expr() && d_expr.typeface === 'roman' &&
       !d_expr.is_bold && d_expr.size_adjustment === 0 &&
       d_expr.expr.is_text_expr_with('d'))
      return true;
    return false;
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

  // Wrap expr in delimiters of the given type (defaulting to '(', ')').
  // Special case: if expr itself is a DelimiterExpr with "blank" delimiters,
  // the blank delimiters are removed first.
  static parenthesize(expr, left_type, right_type) {
    while(expr.is_delimiter_expr() &&
       expr.left_type === '.' && expr.right_type === '.')
      expr = expr.inner_expr;
    return new this(left_type || '(', right_type || ')', expr);
  }

  static parenthesize_if_not_already(expr, left_type, right_type) {
    while(expr.is_delimiter_expr() &&
       expr.left_type === '.' && expr.right_type === '.')
      expr = expr.inner_expr;
    if(expr.is_delimiter_expr())
      return expr;
    else
      return this.parenthesize(expr, left_type, right_type);
  }

  // expr is about to become the base of a SubscriptSuperscriptExpr.
  // The expression will be parenthesized if it is:
  //   - any kind of SequenceExpr, InfixExpr, PrefixExpr, PostfixExpr, TensorExpr
  //   - blank delimiters containing any kind of InfixExpr
  //   - a normal fraction like \frac{x}{y}
  //   - a "primed" expression like f' (but not f'(x)).
  static parenthesize_for_power(expr, left_type, right_type) {
    if(this.should_parenthesize_for_power(expr))
      return this.parenthesize_if_not_already(expr, left_type, right_type);
    else
      return expr;
  }

  // TODO: make non-static
  static should_parenthesize_for_power(expr) {
    return (
      // Any sequence/infix/prefix/postfix/tensor expression
      ['sequence', 'infix', 'prefix', 'postfix', 'tensor'
      ].includes(expr.expr_type()) ||
      // Any infix expression inside "blank" delimiters
      // (e.g. \left. x+y+z \right.)
      (expr.is_delimiter_expr() &&
       expr.left_type === '.' && expr.right_type === '.' &&
       expr.inner_expr.is_infix_expr()) ||
      // \frac{x}{y}
      expr.is_command_expr_with(2, 'frac') ||
      // \sin{x}, \ln{x}, etc., but not \sin({x})
      (expr.is_command_expr_with(1) &&
       !expr.operand_exprs[0].is_delimiter_expr()) ||
      // FontExpr(x) where x itself should be parenthesized.
      (expr.is_font_expr() && expr.typeface !== 'normal' &&
       this.should_parenthesize_for_power(expr.expr)) ||
      // f', f'', but not f'(x)
      (expr.is_subscriptsuperscript_expr() &&
       expr.count_primes() > 0)
    );
  }

  // expr is about to become the argument of a (unary) function call
  // like \sin.  We want to have 'sin(x+1)' but also 'sin 2x', etc.
  // The logic is similar to, but not quite the same as, parenthesize_for_power().
  // TODO: make non-static
  static parenthesize_for_argument(expr, left_type, right_type) {
    if(this.should_parenthesize_for_argument(expr))
      return this.parenthesize_if_not_already(expr, left_type, right_type);
    else
      return expr;
  }

  static should_parenthesize_for_argument(expr) {
    return (
      // NOTE: Only parenthesize SequenceExprs if they don't start
      // with a PrefixExpr: sin 2x, but sin(-2x)
      ['infix', 'prefix', 'postfix', 'tensor'
      ].includes(expr.expr_type()) ||
      // Something like '-2x'.
      (expr.is_sequence_expr() && expr.exprs[0].is_prefix_expr()) ||
      // Any infix expression inside "blank" delimiters
      // (e.g. \left. x+y+z \right.)
      (expr.is_delimiter_expr() &&
       expr.left_type === '.' && expr.right_type === '.' &&
       expr.inner_expr.is_infix_expr()) ||
      // \frac{x}{y}
      expr.is_command_expr_with(2, 'frac') ||
      // \sin{x}, \ln{x}, etc., but not \sin({x})
      (expr.is_command_expr_with(1) &&
       !expr.operand_exprs[0].is_delimiter_expr()) ||
      // FontExpr(x) where x itself should be parenthesized.
      (expr.is_font_expr() && expr.typeface !== 'normal' &&
       this.should_parenthesize_for_argument(expr.expr))
    );
  }

  // Parenthesize 'expr' only if it's a low-precedence InfixExpr like 'x+y'.
  static autoparenthesize(expr, left_type, right_type) {
    if(expr.is_infix_expr() && expr.needs_autoparenthesization())
      return this.parenthesize(expr, left_type, right_type);
    else
      return expr;
  }
  
  expr_type() { return 'delimiter'; }

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
      this.left_type, this.right_type,
      this.inner_expr, fixed_size);
  }

  has_subexpressions() { return true; }
  subexpressions() { return [this.inner_expr]; }

  matches(expr) {
    return super.matches(expr) &&
      this.left_type === expr.left_type &&
      this.right_type === expr.right_type &&
      this.fixed_size === expr.fixed_size;
  }

  replace_subexpression(index, new_expr) {
    return new DelimiterExpr(
      this.left_type, this.right_type,
      new_expr, this.fixed_size);
  }

  // An inline division infix expression surrounded by "blank" delimiters
  // e.g.: \left. x/y \right.
  // In some cases this is treated like a \frac{x}{y} command.
  is_flex_inline_fraction() {
    return this.left_type === '.' && this.right_type === '.' &&
      this.inner_expr.is_infix_expr() &&
      this.inner_expr.operand_count() === 1 &&
      this.inner_expr.operator_text_at(0) === '/';
  }

  // Dissolving removes the delimiters.  As a special case,
  // "flex" fractions are split into numerator/denominator.
  dissolve() {
    if(this.is_flex_inline_fraction())
      return this.inner_expr.operand_exprs;
    else
      return [this.inner_expr];
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

  expr_type() { return 'subscriptsuperscript'; }

  emit_latex(emitter) {
    // If the base_expr is a command, don't put it inside grouping braces.
    // This accounts for attaching subscripts or superscripts to commands
    // with arguments such as \underbrace{xyz}_{abc}.
    if(this.base_expr.is_command_expr())
      emitter.expr(this.base_expr, 0);
    else
      emitter.grouped_expr(this.base_expr, null, 0);
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

  subexpressions() {
    let exprs = [this.base_expr];
    if(this.superscript_expr) exprs.push(this.superscript_expr);
    if(this.subscript_expr) exprs.push(this.subscript_expr);
    return exprs;
  }

  matches(expr) {
    if(this === expr) return true;
    if(this.expr_type() !== expr.expr_type() ||
       (this.superscript_expr === null) !== (expr.superscript_expr === null) ||
       (this.subscript_expr === null) !== (expr.subscript_expr === null) ||
       (this.superscript_expr &&
        !this.superscript_expr.matches(expr.superscript_expr)) ||
       (this.subscript_expr &&
        !this.subscript_expr.matches(expr.subscript_expr)))
      return false;
    return this.base_expr.matches(expr.base_expr);
  }

  // NOTE: the meaning of 'index' varies depending on whether sub/superscript is populated.
  replace_subexpression(index, new_expr) {
    return new SubscriptSuperscriptExpr(
      index === 0 ? new_expr : this.base_expr,
      (index === 2 || (!this.superscript_expr && index === 1)) ? new_expr : this.subscript_expr,
      (index === 1 && this.superscript_expr) ? new_expr : this.superscript_expr);
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

  // If this expr is of the form x^{\prime}, x^{\prime\prime}, etc.,
  // count the number of \primes present (otherwise return 0).
  count_primes() {
    const is_prime_command = expr =>
          expr.is_command_expr_with(0, 'prime');
    const superscript_expr = this.superscript_expr;
    if(!superscript_expr) return 0;
    if(is_prime_command(superscript_expr)) return 1;
    if(superscript_expr.is_sequence_expr() &&
       superscript_expr.exprs.every(is_prime_command))
      return superscript_expr.exprs.length;
    else
      return 0;
  }

  with_prime(autoparenthesize) {
    const prime_count = this.count_primes();
    if(prime_count > 0) {
      // NOTE: with_superscript(null) first strips the existing primes before
      // replacing them with the new set.
      // NOTE: In some edge cases, this may end up parenthesizing the base expression
      // (which already has at least one prime) if it wasn't before.  For example,
      // entering x+y, turning off autoparenthesization with [$][)], adding a prime
      // with [.]['] to get x+y', turning autoparenthesization back on with [$][(]
      // and then adding another prime creates (x+y)''.  Later removing primes with
      // .remove_prime() will not remove the parenthesization.
      return this.with_superscript(null).with_superscript(
        new SequenceExpr(new Array(prime_count+1).fill(new CommandExpr('prime'))));
    }
    else
      return super.with_prime(autoparenthesize);
  }

  // Remove one \prime; f'' -> f', etc.
  remove_prime() {
    const prime_count = this.count_primes();
    if(prime_count === 0)
      return this;
    else if(prime_count === 1)
      return this.with_superscript(null);
    else
      return this.with_superscript(null).with_superscript(
        new SequenceExpr(new Array(prime_count-1).fill(new CommandExpr('prime'))));
  }

  // Overridden from Expr superclass.
  // If the base already has a superscript but no subscript, and is_subscript is true
  // (i.e., adding a subscript), the subscript is placed into the subscript slot
  // so that both slots will be populated.  Otherwise, this SubscriptSuperscriptExpr is
  // nested inside another subscript/superscript node (e.g. x^2^3).
  // A similar rule applies if is_subscript is false.
  // Passing expr=null will remove the existing subscript/superscript if present.
  with_subscript_or_superscript(expr, is_subscript, autoparenthesize = true) {
    if(!expr) {
      // Removing the existing subscript/superscript if present.
      // This may end up returning the base expression itself,
      // which might not be a SubscriptSuperscriptExpr.
      const new_subscript = is_subscript ? null : this.subscript_expr;
      const new_superscript = is_subscript ? this.superscript_expr : null;
      if(new_subscript || new_superscript)
        return new SubscriptSuperscriptExpr(
          this.base_expr, new_subscript, new_superscript);
      else return this.base_expr;
    }
    // Check to see if we can put the child into an empty sub/superscript "slot".
    else if((is_subscript && !this.subscript_expr) ||
            (!is_subscript && !this.superscript_expr)) {
      // There's "room" for it in this expr.
      // NOTE: In this case, the base expression is not (re-)parenthesized,
      // regardless of the setting of 'autoparenthesize', because it should
      // have already been parenthesized if needed when the original subscript
      // or superscript was added.
      return new SubscriptSuperscriptExpr(
        this.base_expr,
        is_subscript ? expr : this.subscript_expr,
        is_subscript ? this.superscript_expr : expr);
    }
    else return super.with_subscript_or_superscript(
      expr, is_subscript, autoparenthesize);
  }
}


// Arrayed structures; these are all 2-dimensional grids of expressions.
// Currently supported "array types" are:
//   - Matrices: bmatrix, Bmatrix, matrix, pmatrix, vmatrix, Vmatrix
//   - Alignment environments: gathered, gather, cases, rcases, substack
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
    return new this(
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
    return new this(
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
    const element_exprs = exprs.map(expr => this._split_expr(expr, split_mode));
    // Special case: when building a \cases structure, and there are no colon-infix expressions,
    // strip out the second column that would normally have the subexpressions to the right
    // of the colon (so we don't get a useless column of empty TextExprs).
    if(split_mode === 'colon' &&
       element_exprs.every(row =>
         row.length === 2 && row[1].is_text_expr_with('')))
      return element_exprs.map(row => [row[0]]);
    else
      return element_exprs;
  }

  // Split up 'expr' into separately-aligned 'columns'.
  static _split_expr(expr, split_mode) {
    switch(split_mode) {
    case 'none':
      return [expr];
    case 'infix':
      if(expr.is_infix_expr()) {
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
      if(expr.is_infix_expr() && [':', 'colon'].includes(expr.operator_text()))
        return [
          expr.extract_side_at(expr.split_at_index, 'left'),
          expr.extract_side_at(expr.split_at_index, 'right')];
      else
        return [expr, TextExpr.blank()];
    case 'colon_if':
      if(expr.is_infix_expr() && [':', 'colon'].includes(expr.operator_text()))
        return [
          expr.extract_side_at(expr.split_at_index, 'left'),
          Expr.concatenate(
            Expr.concatenate(
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

  is_matrix() {
    // TODO: t.endsWith('matrix')?
    return [
      'bmatrix', 'Bmatrix', 'matrix', 'pmatrix', 'vmatrix', 'Vmatrix'
    ].includes(this.array_type);
  }

  // Return a copy of this expression but with a different array_type (e.g. 'pmatrix').
  // is_matrix() should be true before calling this.
  with_array_type(new_array_type) {
    return new ArrayExpr(
      new_array_type, this.row_count, this.column_count,
      this.element_exprs, this.row_separators, this.column_separators);
  }

  as_bold() {
    return new ArrayExpr(
      this.array_type,
      this.row_count,
      this.column_count,
      this.element_exprs.map(
        row_exprs => row_exprs.map(expr => expr.as_bold())),
      this.row_separators,
      this.column_separators);
  }

  // Return a new ArrayExpr like this one, but with ellipses inserted before the
  // last row and column, and along the diagonal.
  // NOTE: is_matrix() should be true before calling this.
  // NOTE: This does not preserve column/row separators.  There's not really a
  // consistent way of doing this automatically.
  with_ellipses() {
    const make_cell = content => new CommandExpr(content);
    let new_row_count = this.row_count, new_column_count = this.column_count;
    let new_element_exprs;
    if(this.column_count > 1) {
      new_element_exprs = this.element_exprs.map((row_exprs, index) => [
        ...row_exprs.slice(0, -1),
        (index === 0 || index === this.row_count-1) ?
          make_cell('cdots') : TextExpr.blank(),
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
    return new ArrayExpr(
      this.array_type, new_row_count, new_column_count, new_element_exprs);
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
    if(cell_expr.is_command_expr_with(0, 'vdots'))
      return new CommandExpr('cdots');
    else if(cell_expr.is_command_expr_with(0, 'cdots'))
      return new CommandExpr('vdots');
    else
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
    for(const [row_index, row_exprs] of this.element_exprs.entries()) {
      if(row_index > 0)
        emitter.row_separator();
      for(const [col_index, expr] of row_exprs.entries()) {
        if(col_index > 0) emitter.align_separator();
        if(expr) emitter.expr(expr, subexpr_index);  // should always be true
        subexpr_index++;
      }
    }
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
    for(const [row_index, row_exprs] of this.element_exprs.entries()) {
      if(row_index > 0) {
        emitter.row_separator();
        const separator = this.row_separators[row_index-1];
        if(separator) {
          if(separator === 'solid') emitter.command('hline')
          else if(separator === 'dashed') emitter.command('hdashline');
          emitter.text("\n");
        }
      }
      for(const [col_index, expr] of row_exprs.entries()) {
        if(col_index > 0) emitter.align_separator();
        if(expr) emitter.expr(expr, subexpr_index);  // should always be true
        subexpr_index++;
      }
    }
    emitter.end_environment('array');
    if(!has_row_separators)
      emitter.text_or_command("\\kern-5pt");
    if(right_delim) {
      emitter.command('right');
      emitter.text_or_command(right_delim);
    }
  }

  subexpressions() {
    // Flatten element expressions in row-major order.
    return [].concat(...this.element_exprs);
  }

  // Matrices "dissolve" into their element expressions in row-major order.
  // Non-matrices break up into their component rows, with each row becoming
  // a 1xN row array of the same type as this one.  For example, a case
  // structure with 3 rows becomes 3 separate case structures (each with its
  // own "case brace").  However, dissolving something that's already a single
  // row will split into the individual elements and lose the array structure.
  dissolve() {
    if(this.is_matrix() || this.row_count <= 1)
      return this.subexpressions();
    else
      return this.split_rows();
  }

  matches(expr) {
    // NOTE: row/column separators are disregarded for matching purposes
    return super.matches(expr) &&
      this.array_type === expr.array_type &&
      this.row_count === expr.row_count &&
      this.column_count === expr.column_count;
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

  // If this ArrayExpr is a column vector of other column vectors
  // (all of the same type and size), flatten them out into a matrix.
  // For example, an 2x1 matrix with [1, 2, 3], [4, 5, 6] as its elements becomes
  // a 3x2 matrix [[1, 2, 3], [4, 5, 6]].
  // This is used to handle Algebrite matrix parsing, which initially gives a
  // vector-of-vectors result for the [[...]] syntax.
  try_flattening_vector_of_vectors() {
    if(!(this.is_matrix() && this.column_count === 1))
      return this;
    const new_element_exprs = [];
    for(const row_exprs of this.element_exprs) {
      const element_expr = row_exprs[0];
      if(!(element_expr.array_type === this.array_type &&
           element_expr.column_count === 1 &&
           element_expr.row_count === this.element_exprs[0][0].row_count))
        return this;
      new_element_exprs.push(
        element_expr.element_exprs.map(row_exprs => row_exprs[0]));
    }
    return new ArrayExpr(
      this.array_type, this.row_count, this.element_exprs[0].length,
      new_element_exprs);
  }
}


// Tensor index notation expression.  A TensorExpr has a base expression
// with four corners (upper/lower plus left/right) that can each contain
// a list of index expressions.  Unlike SubscriptSuperscriptExpr, indices
// can go on the left of the base expression.  Also, null index expressions
// are allowed, in which case they are rendered with the appropriate spacing
// to preserve the index ordering.  Note that, for a given side (left or right),
// both upper and lower index lists must be of the same length.
//
// Subexpressions are in the following order: First any upper-left indexes,
// then lower-left, followed by the base expression itself, then upper-right
// and finally lower-right.  Empty index slots (those containing nulls) are
// not counted.
//
// 'options' is currently unused/unimplemented, but can be a list of option
// strings.
class TensorExpr extends Expr {
  constructor(base_expr, index_exprs = null, options = null) {
    super();
    this.base_expr = base_expr;
    this.options = options || [];
    this.index_exprs = index_exprs || {
      left_upper: [], left_lower: [],
      right_upper: [], right_lower: []
    }
  }

  static position_names() {
    // NOTE: The order matters here, it corresponds to the overall
    // subexpression index ordering.
    return ['left_upper', 'left_lower', 'right_upper', 'right_lower'];
  }

  // "Coerce" an expr to a TensorExpr if needed.
  static from_expr(expr) {
    if(expr.is_tensor_expr())
      return expr;
    else if(expr.is_subscriptsuperscript_expr())
      return new this(expr.base_expr)
        .add_indices('right', expr.superscript_expr, expr.subscript_expr);
    else return new this(expr);
  }

  expr_type() { return 'tensor'; }

  // Add an upper or lower index (or both) to the given side ('left' or 'right')
  // of the tensor expression.  Null can be used to indicate an empty index slot,
  // but at least one of the new index expressions must be non-null.
  // outside=true will add the new index expressions to the beginning of the index
  // lists; this is done when adding left-side indexes so that they appear left of
  // any existing indexes there (slightly more intuitive).
  add_indices(side, upper_index_expr, lower_index_expr, outside = false) {
    const exprs = this.index_exprs;
    const combine = (left, right) =>
          outside ? right.concat(left) : left.concat(right);
    return new TensorExpr(this.base_expr, {
      left_lower: combine(exprs.left_lower, side === 'left' ? [lower_index_expr] : []),
      left_upper: combine(exprs.left_upper, side === 'left' ? [upper_index_expr] : []),
      right_lower: combine(exprs.right_lower, side === 'right' ? [lower_index_expr] : []),
      right_upper: combine(exprs.right_upper, side === 'right' ? [upper_index_expr] : [])
    });
  }

  // Similar to add_indices(), but attach the index_expr to both upper and lower
  // indices as long as the adjacent slots are populated (or if it's directly
  // next to the base expression).
  affix_index(side, index_expr, outside = false) {
    const exprs = this.index_exprs;
    const upper_exprs = side === 'left' ? exprs.left_upper : exprs.right_upper;
    const lower_exprs = side === 'left' ? exprs.left_lower : exprs.right_lower;
    const do_upper = upper_exprs.length === 0 || upper_exprs[outside ? 0 : upper_exprs.length-1];
    const do_lower = lower_exprs.length === 0 || lower_exprs[outside ? 0 : lower_exprs.length-1];
    return this.add_indices(
      side,
      do_upper ? index_expr : null,
      do_lower ? index_expr : null,
      outside);
  }

  swap_left_and_right() {
    const exprs = this.index_exprs;
    return new TensorExpr(this.base_expr, {
      left_lower: exprs.right_lower, left_upper: exprs.right_upper,
      right_lower: exprs.left_lower, right_upper: exprs.left_upper
    });
  }

  swap_lower_and_upper() {
    const exprs = this.index_exprs;
    return new TensorExpr(this.base_expr, {
      left_lower: exprs.left_upper, left_upper: exprs.left_lower,
      right_lower: exprs.right_upper, right_upper: exprs.right_lower
    });
  }

  // Slide indices on both sides towards the base expression,
  // squeezing out any empty slots.
  condense() {
    const sort_fn = (left, right) => {
      // Keep nulls on the right and non-nulls on the left.
      // (Relies on sort() being stable.)
      if(left && !right) return -1;
      else if(right && !left) return 1;
      else return 0;
    };
    let new_index_exprs = {};
    for(const position_name of TensorExpr.position_names()) {
      let new_exprs = [...this.index_exprs[position_name]];
      new_exprs.sort(
        ['right_upper', 'right_lower'].includes(position_name) ?
          sort_fn : (left, right) => -sort_fn(left, right));
      new_index_exprs[position_name] = new_exprs;
    }
    // Delete any empty index pairs that may have been created.
    for(const [upper_exprs, lower_exprs] of
        [[new_index_exprs.left_upper, new_index_exprs.left_lower],
         [new_index_exprs.right_upper, new_index_exprs.right_lower]]) {
      let new_upper_exprs = [], new_lower_exprs = [];
      for(const [i, upper_expr] of upper_exprs.entries()) {
        if(upper_expr || lower_exprs[i]) {
          new_upper_exprs.push(upper_expr);
          new_lower_exprs.push(lower_exprs[i]);
        }
      }
      upper_exprs.splice(0, upper_exprs.length, ...new_upper_exprs);
      lower_exprs.splice(0, lower_exprs.length, ...new_lower_exprs);
    }
    return new TensorExpr(this.base_expr, new_index_exprs);
  }

  emit_latex(emitter) {
    const exprs = this.index_exprs;
    let subexpr_index = 0;
    if(exprs.left_upper.length > 0) {
      // Create a 'phantom' copy of the base_expr; the left subscripts
      // and/or superscripts will be attached to this.
      // TODO: The phantoms create "spooky" false highlights in dissect mode
      // (KaTeX quirk), need to fix it.
      // NOTE: If the subexpressions here are themselves TensorExprs
      // (possibly nested inside other expr types), the phantoms can lead
      // to a 2^n exponential growth; may want to limit the depth.
      emitter.command('vphantom');
      emitter.grouped_expr(this.base_expr, 'force', null);
      emitter.text('^');
      subexpr_index = this._emit_index_group(
        emitter, exprs.left_upper, exprs.left_lower, subexpr_index);
      emitter.text('_');
      subexpr_index = this._emit_index_group(
        emitter, exprs.left_lower, exprs.left_upper, subexpr_index);
    }
    emitter.grouped_expr(this.base_expr, null, subexpr_index++);
    if(exprs.right_upper.length > 0) {
      emitter.text('^');
      subexpr_index = this._emit_index_group(
        emitter, exprs.right_upper, exprs.right_lower, subexpr_index);
      emitter.text('_');
      subexpr_index = this._emit_index_group(
        emitter, exprs.right_lower, exprs.right_upper, subexpr_index);
    }
  }
  // Emit one of the four possible groups of index expressions.
  // 'index_exprs' is the list of expressions in the group (which may
  // contain nulls for empty index slots), while 'opposite_index_exprs'
  // is the corresponding list for the index group above or below it.
  // Empty index slots are rendered as 'phantoms' with copies of the
  // corresponding opposite index item, in order to get the right spacing.
  // Return the new starting subexpression index after the group is
  // emitted (empty index slots do not take up a subexpression index).
  _emit_index_group(emitter, index_exprs, opposite_index_exprs, starting_subexpr_index) {
    let subexpr_index = starting_subexpr_index;
    emitter.grouped(() => {
      for(const [i, index_expr] of index_exprs.entries()) {
        const opposite_index_expr = opposite_index_exprs[i];
        if(index_expr)
          emitter.expr(index_expr, subexpr_index++);
        else if(opposite_index_expr /* should always be non-null if index_expr is null */) {
          emitter.command('hphantom');
          emitter.grouped_expr(opposite_index_expr, 'force', null);
        }
      }
    }, 'force' /* e.g. T^{\,\cdots\,}, not T^\,\cdots\, */);
    return subexpr_index;
  }

  subexpressions() {
    return this.cached_subexpressions ||= this._subexpressions();
  }
  _subexpressions() {
    let subexprs = [];
    const exprs = this.index_exprs;
    for(const index_exprs
        of [exprs.left_upper, exprs.left_lower,
            [this.base_expr],
            exprs.right_upper, exprs.right_lower])
      for(const expr of index_exprs)
        if(expr)
          subexprs.push(expr);
    return subexprs;
  }

  has_subexpressions() { return true; }

  dissolve() { return this.subexpressions(); }

  // NOTE: The default superclass matches() can't be used, because
  // two TensorExprs may have the same .subexpressions() but with
  // their index expressions in different positions.
  matches(expr) {
    if(this === expr) return true;
    if(this.expr_type() !== expr.expr_type()) return false;
    if(!this.base_expr.matches(expr.base_expr)) return false;
    for(const position_name of TensorExpr.position_names()) {
      const exprs1 = this.index_exprs[position_name];
      const exprs2 = expr.index_exprs[position_name];
      if(exprs1.length !== exprs2.length) return false;
      for(const [i, expr1] of exprs1.entries()) {
        const expr2 = exprs2[i];
        if((expr1 === null) !== (expr2 === null)) return false;
        if(expr1 && !expr1.matches(expr2)) return false;
      }
    }
    return true;
  }

  replace_subexpression(index, new_expr) {
    let subexpr_index = 0;
    let new_index_exprs = {};
    let new_base_expr = this.base_expr;
    subexpr_index = this._replace_subexpression(
      index, new_expr, subexpr_index, 'left_upper', new_index_exprs);
    subexpr_index = this._replace_subexpression(
      index, new_expr, subexpr_index, 'left_lower', new_index_exprs);
    if(index === subexpr_index++)
      new_base_expr = new_expr;
    subexpr_index = this._replace_subexpression(
      index, new_expr, subexpr_index, 'right_upper', new_index_exprs);
    this._replace_subexpression(
      index, new_expr, subexpr_index, 'right_lower', new_index_exprs);
    return new TensorExpr(new_base_expr, new_index_exprs);
  }
  _replace_subexpression(index, new_expr, starting_subexpr_index,
                         position_name, new_index_exprs) {
    const exprs = this.index_exprs[position_name];
    let new_exprs = [...exprs];
    let subexpr_index = starting_subexpr_index;
    for(const [i, expr] of exprs.entries())
      if(expr && index === subexpr_index++)
        new_exprs[i] = new_expr;
    new_index_exprs[position_name] = new_exprs;
    return subexpr_index;
  }
}


export {
  Expr, CommandExpr, FontExpr, InfixExpr,
  PrefixExpr, PostfixExpr, FunctionCallExpr,
  PlaceholderExpr, TextExpr, SequenceExpr,
  DelimiterExpr, SubscriptSuperscriptExpr,
  ArrayExpr, TensorExpr
};
