import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/network/api_client.dart';
import '../../../../core/network/dio_image_provider.dart';
import '../../../../core/network/providers.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/email.dart';

/// Email body renderer.
///
/// - Prefers HTML when present; falls back to text-with-quote-styling.
/// - Inline `cid:` images resolve to inline attachment URLs (the
///   backend serves /api/v1/inbox/attachments/:id).
/// - Remote images (http/https hosts) are blocked by default — the
///   sender can use them as read receipts. The user explicitly opts
///   in via a banner above the body; their choice is per-email.
/// - Tables, lists, blockquotes, links, font-family, font-size, and
///   inline color all render via flutter_html with our project styles
///   layered on top.
class EmailBody extends ConsumerStatefulWidget {
  const EmailBody({super.key, required this.email});

  final Email email;

  @override
  ConsumerState<EmailBody> createState() => _EmailBodyState();
}

class _EmailBodyState extends ConsumerState<EmailBody> {
  bool _loadRemote = false;
  ApiClient? _apiClient;

  @override
  void initState() {
    super.initState();
    // Eagerly resolve the API client so attachment + remote image
    // loads can start the moment the user taps "Load images" without
    // waiting on a provider future.
    ref.read(apiClientProvider.future).then((c) {
      if (mounted) setState(() => _apiClient = c);
    });
  }

  Iterable<EmailAttachment> get _inlineAttachments =>
      widget.email.attachments;

  /// True if the body HTML references any remote (http/https) image
  /// host. We only render the privacy banner when there's something
  /// for the user to load — otherwise it's noise.
  bool get _hasRemoteImages {
    final body = widget.email.htmlBody ?? '';
    return RegExp(r'<img[^>]+src=["' "'" r']https?:').hasMatch(body);
  }

  @override
  Widget build(BuildContext context) {
    final html = widget.email.htmlBody;
    if (html == null || html.trim().isEmpty) {
      return _TextBody(text: widget.email.textBody ?? '');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_hasRemoteImages && !_loadRemote) _RemoteBanner(
          onLoad: () => setState(() => _loadRemote = true),
        ),
        Html(
          data: html,
          style: _styles(),
          extensions: [
            // Resolve <img cid:foo> to the inline attachment URL.
            // Strip remote image src when the user hasn't opted in.
            TagExtension(
              tagsToExtend: {'img'},
              builder: (ctx) => _renderImage(ctx),
            ),
          ],
          onLinkTap: (href, _, _) {
            if (href == null || href.isEmpty) return;
            // Open in the device browser. mode=externalApplication
            // prevents in-app webview shenanigans.
            launchUrl(
              Uri.parse(href),
              mode: LaunchMode.externalApplication,
            );
          },
        ),
      ],
    );
  }

  Widget _renderImage(ExtensionContext ctx) {
    final src = ctx.attributes['src'] ?? '';
    final alt = ctx.attributes['alt'] ?? '';
    final widthAttr = ctx.attributes['width'];
    final heightAttr = ctx.attributes['height'];
    final width = double.tryParse(widthAttr ?? '');
    final height = double.tryParse(heightAttr ?? '');

    if (src.startsWith('cid:')) {
      final cid = src.substring(4).trim();
      final attachment = _inlineAttachments.firstWhere(
        (a) => a.id == cid || a.filename.toLowerCase() == cid.toLowerCase(),
        orElse: () => const EmailAttachment(
          id: '', filename: '', contentType: '', sizeBytes: 0,
        ),
      );
      if (attachment.id.isNotEmpty) {
        final apiClient = _apiClient;
        if (apiClient == null) {
          // Resolving the API client; show placeholder this frame
          // and the next setState rebuild will swap in the real image.
          return _ImagePlaceholder(label: alt.isEmpty ? cid : alt);
        }
        // Route through Dio so the user's session cookie carries on
        // the request. Flutter's built-in Image.network uses a
        // separate HTTP stack (no cookies) and the URL would have
        // to be absolute too — DioImageProvider handles both.
        return Image(
          image: DioImageProvider(
            url: apiClient.absoluteUrl(
              '/api/v1/inbox/attachments/${attachment.id}/download',
            ),
            dio: apiClient.dio,
          ),
          width: width,
          height: height,
          errorBuilder: (_, _, _) => _ImagePlaceholder(label: alt),
        );
      }
      return _ImagePlaceholder(label: alt.isEmpty ? cid : alt);
    }

    if (src.startsWith('http://') || src.startsWith('https://')) {
      if (!_loadRemote) {
        return _RemoteImagePlaceholder(label: alt.isEmpty ? src : alt);
      }
      // Remote images go through Flutter's network image — no Dio,
      // no cookies, which is correct: third-party hosts shouldn't
      // see our session.
      return Image.network(
        src,
        width: width,
        height: height,
        errorBuilder: (_, _, _) => _ImagePlaceholder(label: alt),
      );
    }

    // data: URLs render only when the user opted in to remote
    // loading. Otherwise treat as a placeholder.
    if (src.startsWith('data:') && _loadRemote) {
      return Image.network(
        src,
        width: width,
        height: height,
        errorBuilder: (_, _, _) => _ImagePlaceholder(label: alt),
      );
    }
    return _ImagePlaceholder(label: alt.isEmpty ? 'image' : alt);
  }

  /// Style sheet layered on top of the email's own inline styles.
  /// The email author's font-family / font-size / color are preserved
  /// (flutter_html honors them via the `style` attribute); we only
  /// set defaults so unstyled emails read in our app's typography.
  Map<String, Style> _styles() {
    final base = GoogleFonts.inter();
    final mono = GoogleFonts.jetBrainsMono();
    return {
      'body': Style(
        fontFamily: base.fontFamily,
        fontSize: FontSize(14),
        lineHeight: const LineHeight(1.55),
        color: AppColors.textPrimary,
        margin: Margins.zero,
        padding: HtmlPaddings.zero,
      ),
      'p': Style(margin: Margins(bottom: Margin(12))),
      'h1': Style(fontSize: FontSize(22), fontWeight: FontWeight.w700),
      'h2': Style(fontSize: FontSize(18), fontWeight: FontWeight.w700),
      'h3': Style(fontSize: FontSize(16), fontWeight: FontWeight.w600),
      'a': Style(color: AppColors.accent, textDecoration: TextDecoration.underline),
      'strong': Style(fontWeight: FontWeight.w700),
      'em': Style(fontStyle: FontStyle.italic),
      'code': Style(
        fontFamily: mono.fontFamily,
        fontSize: FontSize(12),
        backgroundColor: AppColors.surfaceElevated,
        padding: HtmlPaddings.symmetric(horizontal: 4, vertical: 2),
      ),
      'pre': Style(
        fontFamily: mono.fontFamily,
        fontSize: FontSize(12),
        backgroundColor: AppColors.surfaceElevated,
        padding: HtmlPaddings.all(12),
      ),
      'blockquote': Style(
        border: const Border(left: BorderSide(color: AppColors.textMuted, width: 2)),
        padding: HtmlPaddings.only(left: 12),
        margin: Margins.symmetric(vertical: 8),
        color: AppColors.textTertiary,
      ),
      'table': Style(
        border: Border.all(color: AppColors.border),
      ),
      'th': Style(
        fontWeight: FontWeight.w700,
        padding: HtmlPaddings.symmetric(horizontal: 8, vertical: 4),
        backgroundColor: AppColors.surface,
      ),
      'td': Style(padding: HtmlPaddings.symmetric(horizontal: 8, vertical: 4)),
      'hr': Style(
        height: Height(1),
        backgroundColor: AppColors.border,
        margin: Margins.symmetric(vertical: 12),
      ),
    };
  }
}

class _TextBody extends StatelessWidget {
  const _TextBody({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) {
      return Text(
        'No content.',
        style: GoogleFonts.inter(
          fontSize: 13,
          color: AppColors.textMuted,
        ),
      );
    }
    final lines = text.split('\n');
    final blocks = <Widget>[];
    final buffer = <String>[];
    bool quoting = false;
    void flush() {
      if (buffer.isEmpty) return;
      final content = buffer.join('\n');
      buffer.clear();
      if (quoting) {
        blocks.add(
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(
              border: Border(left: BorderSide(color: AppColors.textMuted, width: 2)),
            ),
            child: SelectableText(
              content.replaceAllMapped(
                RegExp(r'^>+\s?', multiLine: true),
                (_) => '',
              ),
              style: GoogleFonts.jetBrainsMono(
                fontSize: 12,
                color: AppColors.textTertiary,
                height: 1.55,
              ),
            ),
          ),
        );
      } else {
        blocks.add(
          SelectableText(
            content,
            style: GoogleFonts.inter(
              fontSize: 14,
              color: AppColors.textPrimary,
              height: 1.55,
            ),
          ),
        );
      }
    }

    for (final line in lines) {
      final isQuoted = line.startsWith('>');
      if (isQuoted != quoting && buffer.isNotEmpty) {
        flush();
      }
      quoting = isQuoted;
      buffer.add(line);
    }
    flush();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final b in blocks) Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: b,
        ),
      ],
    );
  }
}

class _RemoteBanner extends StatelessWidget {
  const _RemoteBanner({required this.onLoad});
  final VoidCallback onLoad;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        border: const Border(
          left: BorderSide(color: AppColors.accent, width: 2),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.image_not_supported_outlined,
              size: 14, color: AppColors.accent),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Remote images blocked. Sender can track when you load them.',
              style: GoogleFonts.inter(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: onLoad,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Text(
                'Load images',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.accent,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 120,
      width: double.infinity,
      color: AppColors.surface,
      alignment: Alignment.center,
      child: Text(
        label.isEmpty ? '[image]' : '[$label]',
        style: GoogleFonts.jetBrainsMono(
          fontSize: 11,
          color: AppColors.textMuted,
        ),
      ),
    );
  }
}

class _RemoteImagePlaceholder extends StatelessWidget {
  const _RemoteImagePlaceholder({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.image_outlined,
              size: 14, color: AppColors.textMuted),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label.isEmpty ? 'Remote image' : label,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                color: AppColors.textMuted,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
