import 'dart:async';

import '../../../core/network/api_client.dart';

/// One row in the recipient autocomplete dropdown. Shapes mirror the
/// API response from GET /api/v1/contacts/search.
class ContactSuggestion {
  ContactSuggestion({
    required this.id,
    required this.email,
    this.name,
    this.avatarUrl,
    required this.source,
  });

  final String id;
  final String email;
  final String? name;
  final String? avatarUrl;
  /// 'org_member' | 'contact' | 'recent'
  final String source;

  factory ContactSuggestion.fromJson(Map<String, dynamic> json) {
    return ContactSuggestion(
      id: (json['id'] as String?) ?? '',
      email: (json['email'] as String?) ?? '',
      name: json['name'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      source: (json['source'] as String?) ?? 'contact',
    );
  }
}

/// Thin client over the contacts/search endpoint. Decoupled from the
/// rest of MailRepository because it only feeds the compose-screen
/// autocomplete and there's no point bloating that interface.
class ContactsSearch {
  ContactsSearch(this._client);

  final ApiClient _client;

  Future<List<ContactSuggestion>> search(String query, {int limit = 8}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/contacts/search',
      queryParameters: {'q': query, 'limit': limit},
    );
    final raw = response.data?['data'] as List<dynamic>? ?? const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(ContactSuggestion.fromJson)
        .toList(growable: false);
  }
}
