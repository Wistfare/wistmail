import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/app.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const WistMailApp());
    expect(find.byType(WistMailApp), findsOneWidget);
  });
}
