import '../domain/email.dart';
import 'mail_remote_data_source.dart';

abstract class MailRepository {
  Future<EmailPage> listByFolder({String folder, int page, int pageSize});
  Future<Email> getById(String emailId);
  Future<void> markRead(String emailId);
  Future<void> markUnread(String emailId);
  Future<bool> toggleStar(String emailId);
  Future<void> archive(String emailId);
  Future<void> delete(String emailId);
  Future<Map<String, int>> getUnreadCounts();
  Future<String> compose(ComposeDraft draft);
  Future<List<Mailbox>> getMailboxes();
  Future<EmailPage> search(String query);
}

class MailRepositoryImpl implements MailRepository {
  MailRepositoryImpl(this._remote);
  final MailRemoteDataSource _remote;

  @override
  Future<EmailPage> listByFolder({
    String folder = 'inbox',
    int page = 1,
    int pageSize = 25,
  }) =>
      _remote.listByFolder(folder: folder, page: page, pageSize: pageSize);

  @override
  Future<Email> getById(String emailId) => _remote.getById(emailId);

  @override
  Future<void> markRead(String emailId) => _remote.markRead(emailId);

  @override
  Future<void> markUnread(String emailId) => _remote.markUnread(emailId);

  @override
  Future<bool> toggleStar(String emailId) => _remote.toggleStar(emailId);

  @override
  Future<void> archive(String emailId) => _remote.archive(emailId);

  @override
  Future<void> delete(String emailId) => _remote.delete(emailId);

  @override
  Future<Map<String, int>> getUnreadCounts() => _remote.getUnreadCounts();

  @override
  Future<String> compose(ComposeDraft draft) => _remote.compose(draft);

  @override
  Future<List<Mailbox>> getMailboxes() => _remote.getMailboxes();

  @override
  Future<EmailPage> search(String query) => _remote.search(query);
}
