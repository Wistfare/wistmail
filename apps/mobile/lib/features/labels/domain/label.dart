import 'package:flutter/material.dart';

class EmailLabel {
  const EmailLabel({
    required this.id,
    required this.name,
    required this.color,
    required this.mailboxId,
  });

  final String id;
  final String name;
  final String color;
  final String mailboxId;

  factory EmailLabel.fromJson(Map<String, dynamic> json) {
    return EmailLabel(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? '',
      color: (json['color'] as String?) ?? '#999999',
      mailboxId: (json['mailboxId'] as String?) ?? '',
    );
  }

  Color get swatch {
    final hex = color.replaceFirst('#', '');
    if (hex.length != 6) return const Color(0xFF999999);
    return Color(int.parse('FF$hex', radix: 16));
  }
}
