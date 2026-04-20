import '../domain/label.dart';
import 'labels_remote_data_source.dart';

abstract class LabelsRepository {
  Future<List<EmailLabel>> listAll();
  Future<String> create({required String name, required String color, required String mailboxId});
  Future<void> update(String id, {String? name, String? color});
  Future<void> delete(String id);
  Future<List<EmailLabel>> forEmail(String emailId);
  Future<void> setForEmail(String emailId, List<String> labelIds);
}

class LabelsRepositoryImpl implements LabelsRepository {
  LabelsRepositoryImpl(this._remote);
  final LabelsRemoteDataSource _remote;

  @override
  Future<List<EmailLabel>> listAll() => _remote.listAll();

  @override
  Future<String> create({
    required String name,
    required String color,
    required String mailboxId,
  }) =>
      _remote.create(name: name, color: color, mailboxId: mailboxId);

  @override
  Future<void> update(String id, {String? name, String? color}) =>
      _remote.update(id, name: name, color: color);

  @override
  Future<void> delete(String id) => _remote.delete(id);

  @override
  Future<List<EmailLabel>> forEmail(String emailId) => _remote.forEmail(emailId);

  @override
  Future<void> setForEmail(String emailId, List<String> labelIds) =>
      _remote.setForEmail(emailId, labelIds);
}
