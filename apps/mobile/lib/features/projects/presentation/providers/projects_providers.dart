import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../data/projects_remote_data_source.dart';
import '../../data/projects_repository.dart';
import '../../domain/project.dart';

final projectsRepositoryProvider = FutureProvider<ProjectsRepository>((ref) async {
  final client = await ref.watch(apiClientProvider.future);
  return ProjectsRepositoryImpl(ProjectsRemoteDataSource(client));
});

final projectsListProvider =
    FutureProvider.autoDispose.family<List<Project>, String?>((ref, status) async {
  final repo = await ref.watch(projectsRepositoryProvider.future);
  return repo.list(status: status);
});
