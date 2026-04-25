/// AI-generated reply suggestion. Mirrors `email_reply_suggestions`
/// rows produced by the ai-worker. Surfaced as tap-to-fill chips on
/// the Thread screen above the compose action; tapping one routes
/// to /compose with the body pre-filled.
class ReplySuggestion {
  const ReplySuggestion({
    required this.id,
    required this.tone,
    required this.body,
    required this.score,
  });

  final String id;
  final String tone; // concise | warm | decline
  final String body;
  final double score;

  factory ReplySuggestion.fromJson(Map<String, dynamic> json) {
    return ReplySuggestion(
      id: (json['id'] as String?) ?? '',
      tone: (json['tone'] as String?) ?? 'concise',
      body: (json['body'] as String?) ?? '',
      score: (json['score'] as num?)?.toDouble() ?? 0.0,
    );
  }

  String get toneLabel {
    switch (tone) {
      case 'concise':
        return 'Concise';
      case 'warm':
        return 'Warm';
      case 'decline':
        return 'Decline';
      default:
        return tone;
    }
  }
}
