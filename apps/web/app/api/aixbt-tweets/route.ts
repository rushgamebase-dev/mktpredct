import { NextResponse } from "next/server";

const TWITTER_API_KEY = "new1_3885f5f64e984cb2b45d5d8e0bb0899c";
const USERNAME = "aixbt_agent";

export async function GET() {
  try {
    const res = await fetch(
      `https://api.twitterapi.io/twitter/user/last_tweets?userName=${USERNAME}`,
      {
        headers: { "X-API-Key": TWITTER_API_KEY },
        next: { revalidate: 30 },
      },
    );

    if (!res.ok) {
      return NextResponse.json({ tweets: [], todayCount: 0, error: "API failed" }, { status: 500 });
    }

    const data = await res.json();
    const allTweets = data?.data?.tweets ?? [];

    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().slice(0, 10);

    // Group all tweets by date
    const byDate: Record<string, number> = {};
    const hourlyToday: number[] = new Array(24).fill(0);
    let lastTweetTime: string | null = null;

    allTweets.forEach((t: any) => {
      const created = new Date(t.createdAt);
      const dateStr = created.toISOString().slice(0, 10);
      byDate[dateStr] = (byDate[dateStr] ?? 0) + 1;

      // Hourly distribution for today or last 24h
      if (created >= cutoff) {
        hourlyToday[created.getUTCHours()] += 1;
      }

      if (!lastTweetTime) lastTweetTime = t.createdAt;
    });

    // Today's tweets
    const todayTweets = allTweets.filter((t: any) => {
      return new Date(t.createdAt).toISOString().slice(0, 10) === todayStr;
    });

    // Last 24h
    const last24h = allTweets.filter((t: any) => new Date(t.createdAt) >= cutoff);

    const useTweets = todayTweets.length > 0 ? todayTweets : last24h;
    const label = todayTweets.length > 0 ? "today" : "last 24h";

    // Recent activity (last 30 min)
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const recentCount = allTweets.filter((t: any) => new Date(t.createdAt) >= thirtyMinAgo).length;

    // History: last 7 days
    const history: { date: string; count: number; hit: boolean }[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const count = byDate[ds] ?? 0;
      history.push({ date: ds, count, hit: count >= 20 });
    }

    // Streak
    let streak = 0;
    for (const day of history) {
      if (day.count >= 20) streak++;
      else break;
    }

    const tweets = useTweets.map((t: any) => ({
      id: t.id,
      text: t.text,
      createdAt: t.createdAt,
      likeCount: t.likeCount ?? 0,
      retweetCount: t.retweetCount ?? 0,
    }));

    return NextResponse.json({
      tweets,
      todayCount: todayTweets.length,
      last24hCount: last24h.length,
      period: label,
      date: todayStr,
      username: USERNAME,
      history,
      streak,
      hourly: hourlyToday,
      recentCount,
      lastTweetTime,
    });
  } catch (err) {
    return NextResponse.json({ tweets: [], todayCount: 0, error: String(err) }, { status: 500 });
  }
}
