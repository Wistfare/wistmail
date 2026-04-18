class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.statusCode,
    this.details,
  });

  final String code;
  final String message;
  final int? statusCode;
  final Map<String, dynamic>? details;

  bool get isUnauthorized => statusCode == 401;
  bool get isNotFound => statusCode == 404;
  bool get isValidation => code == 'VALIDATION_ERROR' || statusCode == 400;
  bool get isNetwork => code == 'NETWORK_ERROR';

  @override
  String toString() => 'ApiException($code, $statusCode): $message';
}
