import 'email.dart';

/// Initial state passed to the compose screen when navigating from
/// reply/replyAll/forward (or from any other "open compose with X
/// already filled in" affordance).
///
/// Routed via go_router's `extra` so the screen can pull the typed
/// object back without parsing path/query params. Null fields mean
/// "leave this field empty / use defaults".
class ComposeArgs {
  const ComposeArgs({
    this.toAddresses = const [],
    this.cc = const [],
    this.bcc = const [],
    this.subject = '',
    this.body = '',
    this.inReplyTo,
    this.references = const [],
  });

  final List<String> toAddresses;
  final List<String> cc;
  final List<String> bcc;
  final String subject;
  final String body;

  /// `Message-ID` of the email this compose is responding to. The
  /// API uses it to thread the reply server-side.
  final String? inReplyTo;

  /// Full Message-ID chain for threading (RFC 5322 § 3.6.4). The
  /// outbound message gets this list plus `inReplyTo` appended.
  final List<String> references;

  static const empty = ComposeArgs();
}

/// Helpers that turn an existing email into the prefilled compose
/// state for reply / reply-all / forward. Pure functions so they're
/// trivially unit-testable.
class ComposeFromEmail {
  ComposeFromEmail._();

  /// Reply to the sender only. Subject prefixed with "Re: " if not
  /// already; body opens with a quoted block of the original.
  static ComposeArgs reply(Email source, {String? userEmail}) {
    return ComposeArgs(
      toAddresses: [_extractAddress(source.fromAddress)],
      subject: _prefixSubject('Re:', source.subject),
      body: _quoteBody(source),
      inReplyTo: source.id,
    );
  }

  /// Reply to sender + everyone on the original To/Cc, minus the user.
  static ComposeArgs replyAll(Email source, {String? userEmail}) {
    final all = <String>{
      _extractAddress(source.fromAddress),
      ...source.toAddresses.map(_extractAddress),
      ...source.cc.map(_extractAddress),
    }..removeWhere((a) => a.isEmpty || a.toLowerCase() == userEmail?.toLowerCase());

    final from = _extractAddress(source.fromAddress);
    final ccCandidates = all.where((a) => a != from).toList();

    return ComposeArgs(
      toAddresses: [from],
      cc: ccCandidates,
      subject: _prefixSubject('Re:', source.subject),
      body: _quoteBody(source),
      inReplyTo: source.id,
    );
  }

  /// Forward — empty recipients, "Fwd: " subject, full quoted body
  /// including a brief header block.
  static ComposeArgs forward(Email source) {
    return ComposeArgs(
      subject: _prefixSubject('Fwd:', source.subject),
      body: _forwardBody(source),
    );
  }

  /// Idempotent prefix — "Re: Hello" → "Re: Hello", not "Re: Re: Hello".
  static String _prefixSubject(String prefix, String subject) {
    final trimmed = subject.trim();
    if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
      return trimmed;
    }
    return '$prefix ${trimmed.isEmpty ? "(no subject)" : trimmed}';
  }

  static String _extractAddress(String raw) {
    final match = RegExp(r'<([^>]+)>').firstMatch(raw);
    if (match != null) return match.group(1)!.trim();
    return raw.trim();
  }

  /// Build the quoted-reply preamble + the original body line-by-line
  /// prefixed with `> `. Mirrors what every desktop client does so
  /// recipients see a familiar thread structure.
  static String _quoteBody(Email source) {
    final senderName = source.senderName;
    final timestamp = source.createdAt.toLocal();
    final header =
        'On ${_formatDate(timestamp)}, $senderName <${_extractAddress(source.fromAddress)}> wrote:';
    final original = source.textBody ?? '';
    final quoted = original
        .split('\n')
        .map((line) => '> $line')
        .join('\n');
    return '\n\n$header\n$quoted';
  }

  /// Forward block — explicit "Forwarded message" delimiter + a small
  /// header block + the original body unindented (Gmail-style).
  static String _forwardBody(Email source) {
    final lines = <String>[
      '',
      '',
      '---------- Forwarded message ----------',
      'From: ${source.fromAddress}',
      'Date: ${_formatDate(source.createdAt.toLocal())}',
      'Subject: ${source.subject.isEmpty ? "(no subject)" : source.subject}',
      'To: ${source.toAddresses.join(", ")}',
      if (source.cc.isNotEmpty) 'Cc: ${source.cc.join(", ")}',
      '',
      source.textBody ?? '',
    ];
    return lines.join('\n');
  }

  static String _formatDate(DateTime dt) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    final two = (int n) => n.toString().padLeft(2, '0');
    final h12 = ((dt.hour + 11) % 12) + 1;
    final ampm = dt.hour < 12 ? 'AM' : 'PM';
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year} at $h12:${two(dt.minute)} $ampm';
  }
}
