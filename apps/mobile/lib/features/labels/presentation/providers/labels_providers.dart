import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../data/labels_remote_data_source.dart';
import '../../data/labels_repository.dart';
import '../../domain/label.dart';

final labelsRepositoryProvider = FutureProvider<LabelsRepository>((ref) async {
  final client = await ref.watch(apiClientProvider.future);
  return LabelsRepositoryImpl(LabelsRemoteDataSource(client));
});

final labelsListProvider = FutureProvider<List<EmailLabel>>((ref) async {
  final repo = await ref.watch(labelsRepositoryProvider.future);
  return repo.listAll();
});

final labelsForEmailProvider =
    FutureProvider.autoDispose.family<List<EmailLabel>, String>((ref, emailId) async {
  final repo = await ref.watch(labelsRepositoryProvider.future);
  return repo.forEmail(emailId);
});
