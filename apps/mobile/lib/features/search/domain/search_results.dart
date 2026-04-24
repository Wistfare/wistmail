// Domain models for the MobileV3 global search aggregator.
// Mirrors the `/api/v1/search` response shape exactly so the repository
// layer is a thin pass-through.

enum SearchFilter { all, from, files, date }

class SearchTopMatch {
  const SearchTopMatch({
    required this.emailId,
    required this.subject,
    required this.fromName,
    required this.fromAddress,
    required this.snippet,
    required this.createdAt,
  });

  final String emailId;
  final String subject;
  final String fromName;
  final String fromAddress;
  final String snippet;
  final DateTime createdAt;

  factory SearchTopMatch.fromJson(Map<String, dynamic> json) => SearchTopMatch(
        emailId: json['id'] as String,
        subject: (json['subject'] as String?) ?? '(no subject)',
        fromName: (json['fromName'] as String?) ?? '',
        fromAddress: (json['fromAddress'] as String?) ?? '',
        snippet: (json['snippet'] as String?) ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class SearchMessage {
  const SearchMessage({
    required this.emailId,
    required this.subject,
    required this.fromName,
    required this.fromAddress,
    required this.snippet,
    required this.isRead,
    required this.createdAt,
  });

  final String emailId;
  final String subject;
  final String fromName;
  final String fromAddress;
  final String snippet;
  final bool isRead;
  final DateTime createdAt;

  factory SearchMessage.fromJson(Map<String, dynamic> json) => SearchMessage(
        emailId: json['id'] as String,
        subject: (json['subject'] as String?) ?? '(no subject)',
        fromName: (json['fromName'] as String?) ?? '',
        fromAddress: (json['fromAddress'] as String?) ?? '',
        snippet: (json['snippet'] as String?) ?? '',
        isRead: json['isRead'] as bool? ?? true,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class SearchPerson {
  const SearchPerson({
    required this.name,
    required this.email,
    required this.messageCount,
    this.contactId,
  });

  final String name;
  final String email;
  final int messageCount;
  final String? contactId;

  factory SearchPerson.fromJson(Map<String, dynamic> json) => SearchPerson(
        name: (json['name'] as String?) ?? '',
        email: (json['email'] as String?) ?? '',
        messageCount: (json['messageCount'] as num?)?.toInt() ?? 0,
        contactId: json['id'] as String?,
      );
}

class SearchFile {
  const SearchFile({
    required this.attachmentId,
    required this.emailId,
    required this.filename,
    required this.contentType,
    required this.sizeBytes,
    required this.fromName,
    required this.createdAt,
  });

  final String attachmentId;
  final String emailId;
  final String filename;
  final String contentType;
  final int sizeBytes;
  final String fromName;
  final DateTime createdAt;

  factory SearchFile.fromJson(Map<String, dynamic> json) => SearchFile(
        attachmentId: json['id'] as String,
        emailId: (json['emailId'] as String?) ?? '',
        filename: (json['filename'] as String?) ?? '',
        contentType: (json['contentType'] as String?) ?? 'application/octet-stream',
        sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
        fromName: (json['fromName'] as String?) ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class SearchResults {
  const SearchResults({
    required this.query,
    this.topMatch,
    this.messages = const [],
    this.people = const [],
    this.files = const [],
  });

  final String query;
  final SearchTopMatch? topMatch;
  final List<SearchMessage> messages;
  final List<SearchPerson> people;
  final List<SearchFile> files;

  factory SearchResults.fromJson(Map<String, dynamic> json) => SearchResults(
        query: (json['query'] as String?) ?? '',
        topMatch: json['topMatch'] == null
            ? null
            : SearchTopMatch.fromJson(
                json['topMatch'] as Map<String, dynamic>),
        messages: ((json['messages'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(SearchMessage.fromJson)
            .toList(growable: false),
        people: ((json['people'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(SearchPerson.fromJson)
            .toList(growable: false),
        files: ((json['files'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(SearchFile.fromJson)
            .toList(growable: false),
      );

  bool get isEmpty =>
      topMatch == null && messages.isEmpty && people.isEmpty && files.isEmpty;

  static const empty = SearchResults(query: '');
}
