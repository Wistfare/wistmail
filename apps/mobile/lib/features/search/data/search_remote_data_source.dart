import '../../../../core/network/api_client.dart';
import '../domain/search_results.dart';

class SearchRemoteDataSource {
  SearchRemoteDataSource(this._api);
  final ApiClient _api;

  Future<SearchResults> search({
    required String query,
    SearchFilter filter = SearchFilter.all,
    int limit = 10,
  }) async {
    if (query.trim().isEmpty) {
      return SearchResults(query: query);
    }
    final res = await _api.dio.get<Map<String, dynamic>>(
      '/api/v1/search',
      queryParameters: {
        'q': query,
        'filter': filter.name,
        'limit': limit,
      },
    );
    return SearchResults.fromJson(res.data ?? const {});
  }
}
