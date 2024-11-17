interface Author {
  did: string;
  handle: string;
  displayName?: string;
}

interface PostContent {
  text: string;
  repo: string;
  author: Author;
  embed?: {
    images?: any[];
    media?: {
      images?: any[];
    };
  };
  uri?: string;
}

interface LikeRecord {
  value: {
    subject: {
      uri: string;
    };
    createdAt: string;
  };
  postContent?: PostContent;
}

async function getDid(handle: string): Promise<string> {
  const response = await fetch(
    `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`
  );
  if (!response.ok) throw new Error("Could not resolve handle");
  const data = await response.json();
  return data.did;
}

async function getPostContent(uri: string): Promise<PostContent | null> {
  try {
    const [repo, collection, rkey] = uri.split("/").slice(-3);
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.getRecord?repo=${repo}&collection=${collection}&rkey=${rkey}`
    );

    if (!response.ok)
      throw new Error(`Server responded with ${response.status}`);

    const data = await response.json();
    return data.value;
  } catch (error) {
    console.error("Error fetching post content:", error);
    return null;
  }
}

async function fetchLikes(handle: string): Promise<void> {
  try {
    const did = await getDid(handle);
    console.log("Got DID:", did);

    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=app.bsky.feed.like`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok)
      throw new Error(`Server responded with ${response.status}`);

    const data = await response.json();
    console.log("Likes data:", data);

    const postsWithContent = await Promise.all(
      data.records.map(async (like: LikeRecord) => {
        const content = await getPostContent(like.value.subject.uri);
        return {
          ...like,
          postContent: content,
        };
      })
    );

    await showLikesPopup(postsWithContent);
  } catch (error) {
    console.error("Full error:", error);
    alert("Error fetching likes: " + (error as Error).message);
  }
}

async function getHandleFromDid(did: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${did}`
    );
    if (!response.ok) throw new Error("Could not resolve DID");
    const data = await response.json();
    return data.handle;
  } catch (error) {
    console.error("Error getting handle:", error);
    return null;
  }
}

async function showLikesPopup(likes: LikeRecord[]): Promise<void> {
  const popup = document.createElement("div");
  popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80%;
      max-height: 80vh;
      overflow-y: auto;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
      z-index: 10000;
      color: black;
    `;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 5px 10px;
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
  closeBtn.onclick = () => popup.remove();
  popup.appendChild(closeBtn);

  const content = document.createElement("div");

  if (likes && likes.length > 0) {
    const handles = new Map<string, string>();
    await Promise.all(
      likes.map(async (like) => {
        const [, , author] = like.value.subject.uri.split("/");
        const handle = await getHandleFromDid(author);
        if (handle) handles.set(author, handle);
      })
    );

    likes.forEach((like) => {
      const post = document.createElement("div");
      post.style.cssText = `
          margin: 10px 0;
          padding: 15px;
          border-bottom: 1px solid #eee;
          background: #f9f9f9;
          border-radius: 8px;
        `;

      const [, , author] = like.value.subject.uri.split("/");
      const postId = like.value.subject.uri.split("/").pop();
      const handle = handles.get(author) || author;
      const postUrl = `https://bsky.app/profile/${handle}/post/${postId}`;
      const hasImages =
        (like.postContent?.embed?.images?.length ?? 0) > 0 ||
        (like.postContent?.embed?.media?.images?.length ?? 0) > 0;

      post.innerHTML = `
          <div style="margin-bottom: 5px;">
            @${handle}
          </div>
          <div style="white-space: pre-wrap; margin-bottom: 10px;">${
            like.postContent?.text ?? ""
          }</div>
          ${hasImages ? `<div>[Post contains image(s)]</div>` : ""}
          <div style="color: #666; font-size: 0.9em;">
            <a href="${postUrl}" target="_blank" style="color: rgb(32, 139, 254); text-decoration: none;">View post</a>
            · Liked at: ${new Date(like.value.createdAt).toLocaleString()}
          </div>
        `;
      content.appendChild(post);
    });
  } else {
    content.textContent = "No likes found";
  }

  popup.appendChild(content);
  document.body.appendChild(popup);
}

function addLikesButton(): void {
  const existingButton = document.querySelector("#bsky-likes-btn");
  if (existingButton) return;

  const feedbackLink = document.querySelector<HTMLAnchorElement>(
    'a[href*="blueskyweb.zendesk.com"]'
  );
  if (!feedbackLink?.parentElement) return;

  const link = document.createElement("a");
  link.id = "bsky-likes-btn";
  link.textContent = "Show Likes";
  link.href = "#";
  link.dir = "auto";
  link.role = "link";
  link.className = "css-146c3p1 r-1loqt21";
  link.style.cssText = `
      color: rgb(32, 139, 254);
      font-size: 14px;
      letter-spacing: 0px;
      font-weight: 400;
      font-family: InterVariable, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
      font-variant: no-contextual;
    `;

  link.onclick = (e) => {
    e.preventDefault();
    const handle = window.location.pathname.split("/")[2];
    if (handle) fetchLikes(handle);
  };

  const separator = document.createElement("span");
  separator.textContent = " · ";
  separator.style.color = "rgb(32, 139, 254)";

  const firstLink = feedbackLink.parentElement.querySelector("a");
  if (firstLink) {
    feedbackLink.parentElement.insertBefore(link, firstLink);
    feedbackLink.parentElement.insertBefore(separator, firstLink);
  }
}

addLikesButton();

let lastPath = window.location.pathname;
setInterval(() => {
  if (window.location.pathname !== lastPath) {
    lastPath = window.location.pathname;
    if (lastPath.includes("/profile/")) {
      addLikesButton();
    }
  }
}, 1000);
