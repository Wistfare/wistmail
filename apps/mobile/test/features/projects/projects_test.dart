import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/projects/data/projects_remote_data_source.dart';
import 'package:wistmail/features/projects/domain/project.dart';

import '../../helpers/fake_api_client.dart';

Map<String, dynamic> _project({String id = 'p1', String status = 'active'}) => {
      'id': id,
      'name': 'Website Redesign',
      'description': 'Refresh marketing site',
      'status': status,
      'progress': 60,
      'memberUserIds': ['u1', 'u2'],
      'dueDate': '2026-05-15T00:00:00Z',
      'updatedAt': '2026-04-01T00:00:00Z',
    };

void main() {
  group('Project', () {
    test('parses and derives status booleans', () {
      final p = Project.fromJson(_project(status: 'active'));
      expect(p.isActive, true);
      expect(p.isCompleted, false);

      final done = Project.fromJson(_project(status: 'completed'));
      expect(done.isCompleted, true);
    });
  });

  group('ProjectsRemoteDataSource', () {
    test('list sends optional status filter', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/projects', body: {
          'projects': [_project(id: 'p1'), _project(id: 'p2', status: 'completed')],
        });

      final ds = ProjectsRemoteDataSource(builder.build());
      final all = await ds.list();
      expect(all.length, 2);
      expect(builder.capturedRequests.single.queryParameters.containsKey('status'), false);
    });

    test('list passes status to query when provided', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/projects', body: {'projects': [_project()]});

      final ds = ProjectsRemoteDataSource(builder.build());
      await ds.list(status: 'active');
      expect(builder.capturedRequests.single.queryParameters['status'], 'active');
    });

    test('create posts JSON and returns id', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/projects', status: 201, body: {'id': 'prj_new'});

      final ds = ProjectsRemoteDataSource(builder.build());
      final id = await ds.create(name: 'New Project');
      expect(id, 'prj_new');
      final data = builder.capturedRequests.single.data as Map;
      expect(data['name'], 'New Project');
    });
  });
}
