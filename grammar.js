const SPECIAL_CHARACTERS = [
  "'", '"',
  '<', '>',
  '{', '}',
  '\\[', '\\]',
  '(', ')',
  '`', '$',
  '|', '&', ';',
  '\\',
  '\\s',
  '#',
];

module.exports = grammar({
  name: 'bash',

  inline: $ => [
    $._statement,
    $._terminator,
    $._literal,
    $._statements2,
    $._primary_expression,
    $._simple_variable_name,
    $._special_variable_name,
  ],

  externals: $ => [
    $.heredoc_start,
    $._simple_heredoc_body,
    $._heredoc_body_beginning,
    $._heredoc_body_middle,
    $._heredoc_body_end,
    $.file_descriptor,
    $._empty_value,
    $._concat,
    $.variable_name, // Variable name followed by an operator like '=' or '+='
    $.regex,
    '}',
    ']',
    '<<',
    '<<-',
    '\n',
  ],

  extras: $ => [
    $.comment,
    /\\?\s/,
  ],

  word: $ => $.word,

  rules: {
    program: $ => optional($._statements),

    _statements: $ => prec(1, seq(
      repeat(seq(
        $._statement,
        optional(seq('\n', $.heredoc_body)),
        $._terminator
      )),
      $._statement,
      optional(seq('\n', $.heredoc_body)),
      optional($._terminator)
    )),

    _statements2: $ => repeat1(seq(
      $._statement,
      optional(seq('\n', $.heredoc_body)),
      $._terminator
    )),

    _terminated_statement: $ => seq(
      $._statement,
      $._terminator
    ),

    // Statements

    _statement: $ => choice(
      $.redirected_statement,
      $.variable_assignment,
      $.command,
      $.declaration_command,
      $.unset_command,
      $.test_command,
      $.negated_command,
      $.for_statement,
      $.c_style_for_statement,
      $.while_statement,
      $.if_statement,
      $.case_statement,
      $.pipeline,
      $.list,
      $.subshell,
      $.compound_statement,
      $.function_definition
    ),

    redirected_statement: $ => prec(-1, seq(
      $._statement,
      repeat1(choice(
        $.file_redirect,
        $.heredoc_redirect,
        $.herestring_redirect
      ))
    )),

    for_statement: $ => seq(
      'for',
      $._simple_variable_name,
      optional(seq(
        'in',
        repeat1($._literal)
      )),
      $._terminator,
      $.do_group
    ),

    c_style_for_statement: $ => seq(
      'for',
      '((',
      optional(choice($.variable_assignment, $._expression)),
      $._terminator,
      optional($._expression),
      $._terminator,
      optional($._expression),
      '))',
      optional(';'),
      choice(
        $.do_group,
        $.compound_statement
      )
    ),

    while_statement: $ => seq(
      'while',
      $._terminated_statement,
      $.do_group
    ),

    do_group: $ => seq(
      'do',
      optional($._statements2),
      'done'
    ),

    if_statement: $ => seq(
      'if',
      $._terminated_statement,
      'then',
      optional($._statements2),
      repeat($.elif_clause),
      optional($.else_clause),
      'fi'
    ),

    elif_clause: $ => seq(
      'elif',
      $._terminated_statement,
      'then',
      optional($._statements2)
    ),

    else_clause: $ => seq(
      'else',
      optional($._statements2)
    ),

    case_statement: $ => seq(
      'case',
      $._literal,
      optional($._terminator),
      'in',
      $._terminator,
      optional(seq(
        repeat($.case_item),
        alias($.last_case_item, $.case_item),
      )),
      'esac'
    ),

    case_item: $ => seq(
      $._literal,
      repeat(seq('|', $._literal)),
      ')',
      optional($._statements),
      prec(1, ';;')
    ),

    last_case_item: $ => seq(
      $._literal,
      repeat(seq('|', $._literal)),
      ')',
      optional($._statements),
      optional(prec(1, ';;'))
    ),

    function_definition: $ => seq(
      choice(
        seq('function', $.word, optional(seq('(', ')'))),
        seq($.word, '(', ')')
      ),
      $.compound_statement
    ),

    compound_statement: $ => seq(
      '{',
      repeat(seq(
        $._statement,
        optional(seq('\n', $.heredoc_body)),
        $._terminator
      )),
      '}'
    ),

    subshell: $ => seq(
      '(',
      $._statements,
      ')'
    ),

    pipeline: $ => prec.left(1, seq(
      $._statement,
      choice('|', '|&'),
      $._statement
    )),

    list: $ => prec.left(-1, seq(
      $._statement,
      choice('&&', '||'),
      $._statement
    )),

    // Commands

    negated_command: $ => seq(
      '!',
      choice(
        $.command,
        $.test_command,
        $.subshell
      )
    ),

    test_command: $ => seq(
      choice(
        seq('[', $._expression, ']'),
        seq('[[', $._expression, ']]'),
        seq('((', $._arithmetic_expression, '))')
      )
    ),

    declaration_command: $ => prec.left(seq(
      choice('declare', 'typeset', 'export', 'readonly', 'local'),
      repeat(choice(
        $._literal,
        $._simple_variable_name,
        $.variable_assignment
      ))
    )),

    unset_command: $ => prec.left(seq(
      choice('unset', 'unsetenv'),
      repeat(choice(
        $._literal,
        $._simple_variable_name
      ))
    )),

    command: $ => prec.left(seq(
      repeat(choice(
        $.variable_assignment,
        $.file_redirect
      )),
      $.command_name,
      repeat(choice(
        $._literal,
        seq(
          choice('=~', '=='),
          choice($._literal, $.regex)
        )
      ))
    )),

    command_name: $ => $._literal,

    variable_assignment: $ => seq(
      choice(
        $.variable_name,
        $.subscript
      ),
      choice(
        '=',
        '+='
      ),
      choice(
        $._literal,
        $.array,
        $._empty_value
      )
    ),

    subscript: $ => seq(
      $.variable_name,
      '[',
      $._literal,
      optional($._concat),
      ']',
      optional($._concat)
    ),

    file_redirect: $ => prec.left(seq(
      optional($.file_descriptor),
      choice('<', '>', '>>', '&>', '&>>', '<&', '>&'),
      $._literal
    )),

    heredoc_redirect: $ => seq(
      choice('<<', '<<-'),
      $.heredoc_start
    ),

    heredoc_body: $ => choice(
      $._simple_heredoc_body,
      seq(
        $._heredoc_body_beginning,
        repeat(choice(
          $.expansion,
          $.simple_expansion,
          $.command_substitution,
          $._heredoc_body_middle
        )),
        $._heredoc_body_end
      )
    ),

    herestring_redirect: $ => seq(
      '<<<',
      $._literal
    ),

    // Expressions

    _expression: $ => choice(
      $._literal,
      $.unary_expression,
      $.binary_expression,
      $.parenthesized_expression
    ),

    binary_expression: $ => prec.left(choice(
      prec(1, seq($._expression, choice('||', '-o'), $._expression)),
      prec(2, seq($._expression, choice('&&', '-a'), $._expression)),
      prec(3, seq(
        $._expression,
        choice('=', '!=', '-eq', '-ne'),
        $._expression
      )),
      prec(4, seq(
        $._expression,
        choice('-nt', '-ot', '-ef', '<', '<=', '>', '>=', '-lt', '-le', '-gt', '-ge'),
        $._expression
      )),
      seq($._expression, token(prec(4, choice('==', '=~'))), choice(prec(1, $.regex), $._expression))
    )),

    unary_expression: $ => choice(
      prec(5, seq($.test_operator, $._expression)),
      prec.right(seq('!', $._expression))
    ),

    parenthesized_expression: $ => seq(
      '(',
      $._expression,
      ')'
    ),

    // Arithmetic expressions

    _arithmetic_expression: $ => choice(
      $._literal,
      $.unary_arithmetic_expression,
      $.binary_arithmetic_expression,
      $.ternary_arithmetic_expression,
      $.parenthesized_arithmetic_expression
    ),

    parenthesized_arithmetic_expression: $ => seq(
      '(',
      $._arithmetic_expression,
      ')'
    ),

    binary_arithmetic_expression: $ => prec.left(choice(
      prec(1, seq($._arithmetic_expression, prec(20, ','), $._arithmetic_expression)),
      prec(2, seq($._arithmetic_expression, choice('+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '|=', '^=', '&='), $._arithmetic_expression)),
      prec(3, seq($._arithmetic_expression, '=', $._arithmetic_expression)),
      prec(5, seq($._arithmetic_expression, '||', $._arithmetic_expression)),
      prec(6, seq($._arithmetic_expression, '&&', $._arithmetic_expression)),
      prec(7, seq($._arithmetic_expression, '|', $._arithmetic_expression)),
      prec(8, seq($._arithmetic_expression, '&', $._arithmetic_expression)),
      prec(9, seq($._arithmetic_expression, '^', $._arithmetic_expression)),
      prec(10, seq($._arithmetic_expression, choice('==', '!='), $._arithmetic_expression)),
      prec(11, seq($._arithmetic_expression, choice('<', '<=', '>', '>='), $._arithmetic_expression)),
      prec(12, seq($._arithmetic_expression, choice('<<', '>>'), $._arithmetic_expression)),
      prec(13, seq($._arithmetic_expression, choice('+', '-'), $._arithmetic_expression)),
      prec(14, seq($._arithmetic_expression, choice('*', '/', '%'), $._arithmetic_expression)),
    )),

    ternary_arithmetic_expression: $ => prec.right(4, seq(
      $._arithmetic_expression, '?', $._arithmetic_expression, ':', $._arithmetic_expression
    )),

    unary_arithmetic_expression: $ => choice(
      prec(15, seq(choice('-', '+', '!', '~', '++', '--'), $._arithmetic_expression))
    ),

    // Literals

    _literal: $ => choice(
      $.concatenation,
      $._primary_expression,
      alias(prec(-2, repeat1($._special_character)), $.word)
    ),

    _primary_expression: $ => choice(
      $.word,
      $.string,
      $.raw_string,
      $.ansii_c_string,
      $.number,
      $.expansion,
      $.simple_expansion,
      $.string_expansion,
      $.command_substitution,
      $.process_substitution,
      $.arithmetic_expansion
    ),

    arithmetic_expansion: $ => seq('$((', $._arithmetic_expression, '))'),

    concatenation: $ => prec(-1, seq(
      choice(
        $._primary_expression,
        $._special_character,
      ),
      repeat1(prec(-1, seq(
        $._concat,
        choice(
          $._primary_expression,
          $._special_character,
        )
      ))),
      optional(seq($._concat, '$'))
    )),

    _special_character: $ => token(prec(-1, choice('{', '}', '[', ']'))),

    string: $ => seq(
      '"',
      repeat(seq(
        choice(
          seq(optional('$'), $._string_content),
          $.expansion,
          $.simple_expansion,
          $.command_substitution,
          $.arithmetic_expansion,
        ),
        optional($._concat)
      )),
      optional('$'),
      '"'
    ),

    _string_content: $ => token(prec(-1, /([^"`$\\]|\\(.|\n))+/)),

    array: $ => seq(
      '(',
      repeat($._literal),
      ')'
    ),

    raw_string: $ => /'[^']*'/,

    ansii_c_string: $ => /\$'([^']|\\')*'/,

    number: $ => /(0x)?[0-9]+(#[0-9A-Za-z@_]+)?/,

    simple_expansion: $ => seq(
      '$',
      choice(
        $._simple_variable_name,
        $._special_variable_name,
        alias('!', $.special_variable_name),
        alias('#', $.special_variable_name)
      )
    ),

    string_expansion: $ => seq('$', choice($.string, $.raw_string)),

    expansion: $ => seq(
      '${',
      optional(choice('#', '!')),
      choice(
        seq(
          $.variable_name,
          '=',
          optional($._literal)
        ),
        seq(
          choice(
            $.subscript,
            $._simple_variable_name,
            $._special_variable_name
          ),
          optional(seq(
            token(prec(1, '/')),
            optional($.regex)
          )),
          repeat(choice(
            $._literal,
            ':', ':?', '=', ':-', '%', '-', '#'
          ))
        ),
      ),
      '}'
    ),

    command_substitution: $ => choice(
      seq('$(', $._statements, ')'),
      seq('$(', $.file_redirect, ')'),
      prec(1, seq('`', $._statements, '`'))
    ),

    process_substitution: $ => seq(
      choice('<(', '>('),
      $._statements,
      ')'
    ),

    comment: $ => token(prec(-10, /#.*/)),

    _simple_variable_name: $ => alias(/\w+/, $.variable_name),

    _special_variable_name: $ => alias(choice('*', '@', '?', '-', '$', '0', '_'), $.special_variable_name),

    word: $ => token(repeat1(choice(
      noneOf(...SPECIAL_CHARACTERS),
      seq('\\', noneOf('\\s'))
    ))),

    test_operator: $ => token(prec(1, seq('-', /[a-zA-Z]+/))),

    _terminator: $ => choice(';', ';;', '\n', '&')
  }
});

function noneOf(...characters) {
  const negatedString = characters.map(c => c == '\\' ? '\\\\' : c).join('')
  return new RegExp('[^' + negatedString + ']')
}
