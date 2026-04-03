import { NextResponse } from "next/server";

const TWITTER_API_KEY = "new1_3885f5f64e984cb2b45d5d8e0bb0899c";
const USERNAME = "aixbt_agent";

export async function GET() {
  try {
    const res = await fetch(
      `https://api.twitterapi.io/twitter/user/last_tweets?userName=${USERNAME}`,
      {
        headers: { "X-API-Key": TWITTER_API_KEY },
        next: { revalidate: 30 }, // cache 30s
      },
    );

    if (!res.ok) {
      return NextResponse.json({ tweets: [], todayCount: 0, error: "API failed" }, { status: 500 });
    }

    const data = await res.json();
    const allTweets = data?.data?.tweets ?? [];

    // Filter last 24h tweets
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().slice(0, 10);

    // Today's tweets (UTC midnight)
    const todayTweets = allTweets.filter((t: any) => {
      const created = new Date(t.createdAt);
      return created.toISOString().slice(0, 10) === todayStr;
    });

    // Last 24h tweets (fallback when today has 0)
    const last24h = allTweets.filter((t: any) => {
      const created = new Date(t.createdAt);
      return created >= cutoff;
    });

    // Use today's if available, else last 24h
    const useTweets = todayTweets.length > 0 ? todayTweets : last24h;
    const label = todayTweets.length > 0 ? "today" : "last 24h";

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
    });
  } catch (err) {
    return NextResponse.json({ tweets: [], todayCount: 0, error: String(err) }, { status: 500 });
  }
}
