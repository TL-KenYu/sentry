from __future__ import absolute_import


def register_scheme(name):
    try:
        import urlparse  # NOQA
    except ImportError:
        from urllib import parse as urlparse  # NOQA
    uses = urlparse.uses_netloc, urlparse.uses_query, urlparse.uses_relative, urlparse.uses_fragment
    for use in uses:
        if name not in use:
            use.append(name)


register_scheme("app")
register_scheme("chrome-extension")


def patch_httprequest_repr():
    try:
        from django.http import HttpRequest
    except ImportError:
        # This module is potentially imported before Django is installed
        # during a setup.py run
        return

    # Intentionally strip all GET/POST/COOKIE values out of repr() for HttpRequest
    # and subclass WSGIRequest. This prevents sensitive information from getting
    # logged. This was yanked out of Django master anyhow.
    # https://code.djangoproject.com/ticket/12098
    def safe_httprequest_repr(self):
        return "<%s: %s %r>" % (self.__class__.__name__, self.method, self.get_full_path())

    HttpRequest.__repr__ = safe_httprequest_repr


def patch_parse_cookie():
    try:
        from django.utils import six
        from django.utils.encoding import force_str
        from django.utils.six.moves import http_cookies
        from django import http
    except ImportError:
        # This module is potentially imported before Django is installed
        # during a setup.py run
        return

    # Backported from 1.8.15: https://github.com/django/django/blob/1.8.15/django/http/cookie.py#L91
    # See https://www.djangoproject.com/weblog/2016/sep/26/security-releases/ for more context.
    def safe_parse_cookie(cookie):
        """
        Return a dictionary parsed from a `Cookie:` header string.
        """
        cookiedict = {}
        if six.PY2:
            cookie = force_str(cookie)
        for chunk in cookie.split(";"):
            if "=" in chunk:
                key, val = chunk.split("=", 1)
            else:
                # Assume an empty name per
                # https://bugzilla.mozilla.org/show_bug.cgi?id=169091
                key, val = "", chunk
            key, val = key.strip(), val.strip()
            if key or val:
                # unquote using Python's algorithm.
                cookiedict[key] = http_cookies._unquote(val)
        return cookiedict

    http.parse_cookie = safe_parse_cookie


def patch_django_views_debug():
    # Prevent exposing any Django SETTINGS on our debug error page
    # This information is not useful for Sentry development
    # and poses a significant security risk if this is exposed by accident
    # in any production system if, by change, it were deployed
    # with DEBUG=True.
    try:
        from django.views import debug
    except ImportError:
        return

    debug.get_safe_settings = lambda: {}


# For distribution builds, can't be inside `model_unpickle_compat` since we're patching the functions
try:
    import django.db.models.base

    model_unpickle = django.db.models.base.model_unpickle
except ImportError:
    pass


def model_unpickle_compat(model_id, attrs=None, factory=None):
    from django import VERSION

    if VERSION[:2] == (1, 9):
        attrs = [] if attrs is None else attrs
        factory = django.db.models.base.simple_class_factory if factory is None else factory
        return model_unpickle(model_id, attrs, factory)
    elif VERSION[:2] == (1, 10):
        return model_unpickle(model_id)
    else:
        raise NotImplementedError


def simple_class_factory_compat(model, attrs):
    return model


def patch_model_unpickle():
    # https://code.djangoproject.com/ticket/27187
    # Django 1.10 breaks pickle compat with 1.9 models.
    import django.db.models.base

    django.db.models.base.model_unpickle = model_unpickle_compat

    # Django 1.10 needs this to unpickle 1.9 models, but we can't branch while
    # monkeypatching else our monkeypatched funcs won't be pickleable.
    # So just vendor simple_class_factory from 1.9.
    django.db.models.base.simple_class_factory = simple_class_factory_compat


for patch in (patch_parse_cookie, patch_httprequest_repr, patch_django_views_debug):
    patch()
