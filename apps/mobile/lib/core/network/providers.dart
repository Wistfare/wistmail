import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import '../config/app_config.dart';
import 'api_client.dart';

final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.dev);

final cookieJarProvider = FutureProvider<CookieJar>((ref) async {
  final dir = await getApplicationSupportDirectory();
  return PersistCookieJar(storage: FileStorage('${dir.path}/.cookies'));
});

final apiClientProvider = FutureProvider<ApiClient>((ref) async {
  final config = ref.watch(appConfigProvider);
  final jar = await ref.watch(cookieJarProvider.future);
  return ApiClient.create(baseUrl: config.apiBaseUrl, cookieJar: jar);
});
