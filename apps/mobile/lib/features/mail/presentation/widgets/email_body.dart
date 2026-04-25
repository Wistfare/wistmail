import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/network/api_client.dart';
import '../../../../core/network/providers.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/email.dart';

/// Email body renderer.
///
/// HTML emails are rendered inside a sandboxed in-process WebView
/// (`flutter_inappwebview`) so newsletter HTML — table layouts, class
/// CSS, percent widths, the works — paints exactly as it would in a
/// real browser. Plain text emails fall back to a native widget tree.
///
/// Privacy / safety guarantees:
///   * `<script>` tags and inline `on*=` handlers are stripped before
///     load, so author JS never runs.
///   * Remote http(s) image hosts are blocked by default (read-receipt
///     pixels). The user opts in per-email via the banner.
///   * `cid:` images are rewritten to authenticated attachment URLs;
///     session cookies from the Dio jar are pre-loaded into the
///     WebView's cookie store so the requests authenticate.
///   * Links open in the system browser (no in-app navigation).
///   * The page measures its own height and reports it back via JS
///     channel, letting us embed inline in the surrounding scroll view
///     without nested scrolling.
class EmailBody extends ConsumerStatefulWidget {
  const EmailBody({super.key, required this.email});

  final Email email;

  @override
  ConsumerState<EmailBody> createState() => _EmailBodyState();
}

class _EmailBodyState extends ConsumerState<EmailBody> {
  bool _loadRemote = false;

  @override
  Widget build(BuildContext context) {
    final html = widget.email.htmlBody;
    final text = widget.email.textBody ?? '';

    if (html == null || html.trim().isEmpty) {
      return text.trim().isEmpty
          ? const SizedBox.shrink()
          : _TextBody(text: text);
    }
    final hasRemote = _hasRemoteImages(html);
    if (!_hasVisibleHtmlContent(html) && !hasRemote) {
      return text.trim().isEmpty
          ? const SizedBox.shrink()
          : _TextBody(text: text);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (hasRemote && !_loadRemote)
          _RemoteBanner(onLoad: () => setState(() => _loadRemote = true)),
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: _HtmlEmailWebView(
            html: html,
            attachments: widget.email.attachments,
            allowRemoteImages: _loadRemote,
            isDark: Theme.of(context).brightness == Brightness.dark,
          ),
        ),
      ],
    );
  }

  /// Does the HTML reference any visible (i.e. non-tracking-pixel) remote
  /// image? We only show the privacy banner when there's something for the
  /// user to load — otherwise it's noise.
  static bool _hasRemoteImages(String html) {
    final tagRe = RegExp(r'<img\b[^>]*>', caseSensitive: false);
    for (final match in tagRe.allMatches(html)) {
      final attrs = _parseAttrs(match.group(0) ?? '');
      final src = attrs['src'] ?? '';
      if (!(src.startsWith('http://') || src.startsWith('https://'))) continue;
      if (_isVisibleImage(attrs)) return true;
    }
    return false;
  }

  /// True if the HTML contains any text or an image to render. Without
  /// this check, an email whose only "html" part is `<html><body></body>`
  /// would render an empty WebView card; we'd rather show the text part.
  static bool _hasVisibleHtmlContent(String html) {
    final withoutMeta = html.replaceAll(
      RegExp(
        r'<(script|style|head|meta|title)\b[^>]*>.*?</\1>',
        caseSensitive: false,
        dotAll: true,
      ),
      '',
    );
    final withoutImgs = withoutMeta.replaceAll(
      RegExp(r'<img\b[^>]*>', caseSensitive: false),
      '',
    );
    final text = withoutImgs
        .replaceAll(RegExp(r'<[^>]+>'), ' ')
        .replaceAll(RegExp(r'&nbsp;|&#160;', caseSensitive: false), ' ')
        .replaceAll(RegExp(r'&[a-zA-Z0-9#]+;'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    return text.isNotEmpty;
  }

  static Map<String, String> _parseAttrs(String tag) {
    final attrs = <String, String>{};
    final attrRe = RegExp(
      r'''([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))''',
    );
    for (final match in attrRe.allMatches(tag)) {
      final key = (match.group(1) ?? '').toLowerCase();
      final value = match.group(2) ?? match.group(3) ?? match.group(4) ?? '';
      attrs[key] = value;
    }
    return attrs;
  }

  /// 1×1 tracking pixels and `display:none` images are filtered out so the
  /// privacy banner only fires when there's something user-visible to gate.
  static bool _isVisibleImage(Map<String, String> attrs) {
    final style = (attrs['style'] ?? '').toLowerCase().replaceAll(' ', '');
    if (style.contains('display:none') ||
        style.contains('visibility:hidden') ||
        style.contains('opacity:0')) {
      return false;
    }
    final width = double.tryParse(
      (attrs['width'] ?? '').replaceAll(RegExp(r'[^0-9.]'), ''),
    );
    final height = double.tryParse(
      (attrs['height'] ?? '').replaceAll(RegExp(r'[^0-9.]'), ''),
    );
    if (width != null && height != null && width <= 2 && height <= 2) {
      return false;
    }
    return true;
  }
}

/// Embedded WebView that paints the email HTML and reports its own height
/// so the parent scroll view can lay it out as if it were a native widget.
class _HtmlEmailWebView extends ConsumerStatefulWidget {
  const _HtmlEmailWebView({
    required this.html,
    required this.attachments,
    required this.allowRemoteImages,
    required this.isDark,
  });

  final String html;
  final List<EmailAttachment> attachments;
  final bool allowRemoteImages;
  final bool isDark;

  @override
  ConsumerState<_HtmlEmailWebView> createState() => _HtmlEmailWebViewState();
}

class _HtmlEmailWebViewState extends ConsumerState<_HtmlEmailWebView> {
  /// Provisional height before the page reports its actual content size.
  /// Big enough to avoid a visible "snap" when short emails settle.
  double _height = 200;
  ApiClient? _apiClient;
  String? _document;
  InAppWebViewController? _controller;
  bool _cookiesSynced = false;

  @override
  void initState() {
    super.initState();
    _prepare();
  }

  @override
  void didUpdateWidget(covariant _HtmlEmailWebView old) {
    super.didUpdateWidget(old);
    if (old.allowRemoteImages != widget.allowRemoteImages ||
        old.html != widget.html ||
        old.isDark != widget.isDark) {
      _prepare();
    }
  }

  Future<void> _prepare() async {
    final api = await ref.read(apiClientProvider.future);
    if (!mounted) return;
    if (!_cookiesSynced) {
      await _syncCookies(api);
      _cookiesSynced = true;
    }
    if (!mounted) return;
    final doc = _buildDocument(
      widget.html,
      widget.attachments,
      api,
      widget.allowRemoteImages,
      widget.isDark,
    );
    setState(() {
      _apiClient = api;
      _document = doc;
    });
    final controller = _controller;
    if (controller != null) {
      await controller.loadData(
        data: doc,
        baseUrl: WebUri(api.baseUrl),
        mimeType: 'text/html',
        encoding: 'utf-8',
      );
    }
  }

  /// Copy the user's session cookie from Dio's jar into the WebView's
  /// cookie store, so authenticated requests for `cid:` attachments
  /// (rewritten to absolute URLs) carry the session.
  Future<void> _syncCookies(ApiClient api) async {
    final base = Uri.parse(api.baseUrl);
    final cookies = await api.cookieJar.loadForRequest(base);
    final cm = CookieManager.instance();
    for (final c in cookies) {
      await cm.setCookie(
        url: WebUri(api.baseUrl),
        name: c.name,
        value: c.value,
        domain: base.host,
        path: c.path ?? '/',
        isSecure: c.secure,
        isHttpOnly: c.httpOnly,
      );
    }
  }

  String _buildDocument(
    String userHtml,
    List<EmailAttachment> attachments,
    ApiClient api,
    bool allowRemote,
    bool isDark,
  ) {
    var sanitized = _stripScripts(userHtml);
    sanitized = _stripEventHandlers(sanitized);
    sanitized = _rewriteImages(sanitized, attachments, api, allowRemote);
    final theme = isDark ? _darkTheme : _lightTheme;
    String css(Color c) {
      final v = c.toARGB32() & 0xFFFFFF;
      return '#${v.toRadixString(16).padLeft(6, '0')}';
    }

    return '''<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<meta name="color-scheme" content="${isDark ? 'dark light' : 'light dark'}">
<style>
  :root { color-scheme: ${isDark ? 'dark' : 'light'}; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.55;
    color: ${css(theme.text)};
    background: ${css(theme.background)};
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: ${css(theme.link)}; }
  blockquote {
    border-left: 2px solid ${css(theme.quoteBorder)};
    padding-left: 12px;
    margin: 8px 0;
    color: ${css(theme.quoteText)};
  }
  pre, code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    background: ${css(theme.codeBackground)};
  }
  code { padding: 2px 4px; border-radius: 3px; font-size: 12px; }
  pre { padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
</style>
</head>
<body>
$sanitized
<script>
(function() {
  function postHeight() {
    var h = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    );
    if (window.flutter_inappwebview) {
      window.flutter_inappwebview.callHandler('contentHeight', h);
    }
  }
  function bindImages() {
    var imgs = document.images;
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener('load', postHeight);
      imgs[i].addEventListener('error', postHeight);
    }
  }
  document.addEventListener('click', function(e) {
    var node = e.target;
    while (node && node !== document) {
      if (node.tagName === 'A' && node.getAttribute('href')) {
        e.preventDefault();
        if (window.flutter_inappwebview) {
          window.flutter_inappwebview.callHandler('openLink', node.href);
        }
        return;
      }
      node = node.parentNode;
    }
  }, true);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    bindImages();
    postHeight();
  } else {
    window.addEventListener('DOMContentLoaded', function() { bindImages(); postHeight(); });
  }
  window.addEventListener('load', postHeight);
  window.addEventListener('resize', postHeight);
})();
</script>
</body>
</html>''';
  }

  String _stripScripts(String html) {
    return html.replaceAll(
      RegExp(
        r'<\s*script\b[^>]*>.*?<\s*/\s*script\s*>',
        caseSensitive: false,
        dotAll: true,
      ),
      '',
    );
  }

  String _stripEventHandlers(String html) {
    return html.replaceAllMapped(RegExp(r'<[^>]+>'), (match) {
      final tag = match.group(0) ?? '';
      return tag.replaceAll(
        RegExp(
          r'''\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)''',
          caseSensitive: false,
        ),
        '',
      );
    });
  }

  String _rewriteImages(
    String html,
    List<EmailAttachment> attachments,
    ApiClient api,
    bool allowRemote,
  ) {
    return html.replaceAllMapped(
      RegExp(r'<img\b[^>]*>', caseSensitive: false),
      (match) {
        final tag = match.group(0) ?? '';
        final attrs = _EmailBodyState._parseAttrs(tag);
        final src = attrs['src'] ?? '';
        String? newSrc;

        if (src.startsWith('cid:')) {
          final cid = _cleanContentId(src.substring(4));
          final attachment = _findAttachment(attachments, cid);
          if (attachment != null) {
            newSrc = api.absoluteUrl(
              '/api/v1/inbox/attachments/${attachment.id}/download',
            );
          } else {
            newSrc = '';
          }
        } else if (src.startsWith('http://') || src.startsWith('https://')) {
          if (!allowRemote) {
            // Hide rather than rewrite — leaves the layout intact (max-width
            // CSS keeps the slot from collapsing) without firing the request.
            newSrc = '';
          }
        }

        if (newSrc == null) return tag;
        // Replace the src attribute, preserving everything else.
        return tag.replaceFirst(
          RegExp(
            r'''\ssrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)''',
            caseSensitive: false,
          ),
          ' src="${_attrEscape(newSrc)}"',
        );
      },
    );
  }

  EmailAttachment? _findAttachment(
    List<EmailAttachment> attachments,
    String cid,
  ) {
    final target = cid.toLowerCase();
    for (final a in attachments) {
      if (a.id == cid) return a;
      if (_cleanContentId(a.contentId ?? '').toLowerCase() == target) return a;
      if (a.filename.toLowerCase() == target) return a;
    }
    return null;
  }

  String _cleanContentId(String raw) =>
      raw.trim().replaceAll(RegExp(r'^[<\s]+|[>\s]+$'), '');

  String _attrEscape(String value) =>
      value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

  @override
  Widget build(BuildContext context) {
    final doc = _document;
    final api = _apiClient;
    if (doc == null || api == null) {
      return const SizedBox(
        height: 80,
        child: Center(
          child: SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 1.5),
          ),
        ),
      );
    }
    final theme = widget.isDark ? _darkTheme : _lightTheme;
    return Container(
      color: theme.background,
      child: SizedBox(
        height: _height,
        child: InAppWebView(
          initialData: InAppWebViewInitialData(
            data: doc,
            baseUrl: WebUri(api.baseUrl),
            mimeType: 'text/html',
            encoding: 'utf-8',
          ),
          initialSettings: InAppWebViewSettings(
            javaScriptEnabled: true,
            transparentBackground: false,
            useShouldOverrideUrlLoading: true,
            mediaPlaybackRequiresUserGesture: true,
            allowsInlineMediaPlayback: false,
            supportZoom: false,
            disableVerticalScroll: true,
            disableHorizontalScroll: true,
            verticalScrollBarEnabled: false,
            horizontalScrollBarEnabled: false,
            // iOS: prevent rubber-band so the page feels embedded.
            disallowOverScroll: true,
            // Android: keep WebView in-process for simpler lifecycle.
            useHybridComposition: true,
          ),
          onWebViewCreated: (controller) {
            _controller = controller;
            controller.addJavaScriptHandler(
              handlerName: 'contentHeight',
              callback: (args) {
                if (args.isEmpty) return null;
                final raw = args.first;
                final h = raw is num ? raw.toDouble() : null;
                if (h == null || !mounted) return null;
                if ((h - _height).abs() > 1) {
                  setState(() => _height = h);
                }
                return null;
              },
            );
            controller.addJavaScriptHandler(
              handlerName: 'openLink',
              callback: (args) {
                if (args.isEmpty) return null;
                final href = args.first;
                if (href is! String) return null;
                final uri = Uri.tryParse(href);
                if (uri != null) {
                  launchUrl(uri, mode: LaunchMode.externalApplication);
                }
                return null;
              },
            );
          },
          shouldOverrideUrlLoading: (controller, action) async {
            final url = action.request.url?.toString();
            if (url == null) return NavigationActionPolicy.CANCEL;
            // Allow the initial document load (matches our baseUrl).
            if (action.isForMainFrame == false ||
                url == 'about:blank' ||
                url.startsWith(api.baseUrl)) {
              return NavigationActionPolicy.ALLOW;
            }
            if (url.startsWith('http://') ||
                url.startsWith('https://') ||
                url.startsWith('mailto:') ||
                url.startsWith('tel:')) {
              final uri = Uri.tryParse(url);
              if (uri != null) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
              return NavigationActionPolicy.CANCEL;
            }
            return NavigationActionPolicy.CANCEL;
          },
        ),
      ),
    );
  }
}

class _EmailTheme {
  const _EmailTheme({
    required this.background,
    required this.text,
    required this.link,
    required this.quoteBorder,
    required this.quoteText,
    required this.codeBackground,
  });

  final Color background;
  final Color text;
  final Color link;
  final Color quoteBorder;
  final Color quoteText;
  final Color codeBackground;
}

const _lightTheme = _EmailTheme(
  background: Color(0xFFFFFFFF),
  text: Color(0xFF111111),
  link: Color(0xFF1B6FE0),
  quoteBorder: Color(0xFFCCCCCC),
  quoteText: Color(0xFF666666),
  codeBackground: Color(0xFFF2F2F2),
);

// Dark-mode email surface matches AppColors.background (#000000) exactly so
// the email card vanishes into the app chrome — no visible "card" rectangle
// for plain-text or unstyled-HTML messages. Author CSS that paints its own
// background still shows through (newsletters with `<table bgcolor="#fff">`).
const _darkTheme = _EmailTheme(
  background: Color(0xFF000000),
  text: Color(0xFFFFFFFF),
  link: Color(0xFF8AB4F8),
  quoteBorder: Color(0xFF3A3A3A),
  quoteText: Color(0xFF9A9A9A),
  codeBackground: Color(0xFF1A1A1A),
);

class _TextBody extends StatelessWidget {
  const _TextBody({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) {
      return Text(
        'No content.',
        style: GoogleFonts.inter(fontSize: 13, color: AppColors.textMuted),
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
              border: Border(
                left: BorderSide(color: AppColors.textMuted, width: 2),
              ),
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
        for (final b in blocks)
          Padding(padding: const EdgeInsets.only(bottom: 10), child: b),
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
          const Icon(
            Icons.image_not_supported_outlined,
            size: 14,
            color: AppColors.accent,
          ),
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
