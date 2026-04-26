/// Lightweight directory entry returned by the chat user-search endpoint.
/// Used by the New Chat screen to power the typeahead picker; we
/// intentionally keep this distinct from `Participant` (which hangs
/// off a Conversation) so a search match doesn't imply membership.
class Contact {
  const Contact({
    required this.id,
    required this.name,
    required this.email,
    this.avatarUrl,
  });

  final String id;
  final String name;
  final String email;
  final String? avatarUrl;

  factory Contact.fromJson(Map<String, dynamic> json) => Contact(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String,
        avatarUrl: json['avatarUrl'] as String?,
      );
}
