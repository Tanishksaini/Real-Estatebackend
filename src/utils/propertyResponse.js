function formatProperty(doc) {
  if (!doc) return null;

  const o = typeof doc.toObject === "function" ? doc.toObject({ virtuals: true }) : { ...doc };
  const analytics = o.analytics || {};

  const views = analytics.views ?? 0;
  const enquiries = analytics.enquiries ?? 0;
  const favorites = analytics.favorites ?? 0;
  const calls = analytics.calls ?? 0;
  const shares = analytics.shares ?? 0;

  return {
    ...o,
    viewCount: views,
    enquiryCount: enquiries,
    favoriteCount: favorites,
    analytics: { views, enquiries, favorites, calls, shares }
  };
}

function formatPropertyList(items) {
  return (items || []).map(formatProperty);
}

module.exports = { formatProperty, formatPropertyList };
