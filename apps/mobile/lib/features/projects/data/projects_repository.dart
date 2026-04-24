import '../domain/project.dart';
import 'projects_remote_data_source.dart';

abstract class ProjectsRepository {
  Future<List<Project>> list({String? status});
  Future<String> create({
    required String name,
    String? description,
    List<String> memberUserIds,
    DateTime? dueDate,
  });
  Future<List<RecentDoc>> listRecentDocs({int limit});
}

class ProjectsRepositoryImpl implements ProjectsRepository {
  ProjectsRepositoryImpl(this._remote);
  final ProjectsRemoteDataSource _remote;

  @override
  Future<List<Project>> list({String? status}) => _remote.list(status: status);

  @override
  Future<String> create({
    required String name,
    String? description,
    List<String> memberUserIds = const [],
    DateTime? dueDate,
  }) =>
      _remote.create(
        name: name,
        description: description,
        memberUserIds: memberUserIds,
        dueDate: dueDate,
      );

  @override
  Future<List<RecentDoc>> listRecentDocs({int limit = 10}) =>
      _remote.listRecentDocs(limit: limit);
}
