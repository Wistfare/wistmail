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
  /// Hard-delete a single email (must already be in Trash).
  Future<void> purge(String emailId);
  /// Empty the whole Trash folder. Returns purged counts for toasts.
  Future<Map<String, int>> emptyTrash();
  /// Empty any folder that auto-purges (trash or spam).
  Future<Map<String, int>> emptyFolder(String folder);
  /// How many days emails linger in Trash before auto-purge.
  Future<int> getTrashRetention();
  /// Retention for any auto-purging folder (trash or spam).
  Future<int> getFolderRetention(String folder);
  /// Bulk mutation helper. Returns the number of affected rows.
  Future<int> batchAction({
    required List<String> ids,
    required String action,
    String? folder,
    List<String>? labelIds,
  });
  Future<Map<String, int>> getUnreadCounts();
  Future<String> compose(ComposeDraft draft);
  Future<List<Mailbox>> getMailboxes();
  Future<EmailPage> search(String query);
  /// User-initiated retry for an email currently in 'failed' or
  /// 'rate_limited'. Backend transitions it back to 'sending' and
  /// the WS event flips the row's pill.
  Future<void> dispatch(String emailId);
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
  Future<void> purge(String emailId) => _remote.purge(emailId);

  @override
  Future<Map<String, int>> emptyTrash() => _remote.emptyTrash();

  @override
  Future<Map<String, int>> emptyFolder(String folder) =>
      _remote.emptyFolder(folder);

  @override
  Future<int> getTrashRetention() => _remote.getTrashRetention();

  @override
  Future<int> getFolderRetention(String folder) =>
      _remote.getFolderRetention(folder);

  @override
  Future<int> batchAction({
    required List<String> ids,
    required String action,
    String? folder,
    List<String>? labelIds,
  }) =>
      _remote.batchAction(
        ids: ids,
        action: action,
        folder: folder,
        labelIds: labelIds,
      );

  @override
  Future<Map<String, int>> getUnreadCounts() => _remote.getUnreadCounts();

  @override
  Future<String> compose(ComposeDraft draft) => _remote.compose(draft);

  @override
  Future<List<Mailbox>> getMailboxes() => _remote.getMailboxes();

  @override
  Future<EmailPage> search(String query) => _remote.search(query);

  @override
  Future<void> dispatch(String emailId) => _remote.dispatch(emailId);
}
