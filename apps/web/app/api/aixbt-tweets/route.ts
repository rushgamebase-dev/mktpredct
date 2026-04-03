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

    // Filter today's tweets (UTC)
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // "2026-04-02"

    const todayTweets = allTweets.filter((t: any) => {
      const created = new Date(t.createdAt);
      return created.toISOString().slice(0, 10) === todayStr;
    });

    // Return simplified tweet data
    const tweets = todayTweets.map((t: any) => ({
      id: t.id,
      text: t.text,
      createdAt: t.createdAt,
      likeCount: t.likeCount ?? 0,
      retweetCount: t.retweetCount ?? 0,
    }));

    return NextResponse.json({
      tweets,
      todayCount: tweets.length,
      date: todayStr,
      username: USERNAME,
    });
  } catch (err) {
    return NextResponse.json({ tweets: [], todayCount: 0, error: String(err) }, { status: 500 });
  }
}
