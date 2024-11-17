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
  const { did } = await response.json();
  return did;
}

async function getPostContent(uri: string): Promise<PostContent | null> {
  try {
    const [repo, collection, rkey] = uri.split("/").slice(-3);
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.getRecord?repo=${repo}&collection=${collection}&rkey=${rkey}`
    );
    if (!response.ok) return null;
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
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=app.bsky.feed.like`
    );
    if (!response.ok) throw new Error(`Server responded with ${response.status}`);

    const data = await response.json();
    const postsWithContent = await Promise.all(
      data.records.map(async (like: LikeRecord) => ({
        ...like,
        postContent: await getPostContent(like.value.subject.uri)
      }))
    );

    await showLikesPopup(postsWithContent);
  } catch (error) {
    alert("Error fetching likes: " + (error as Error).message);
  }
}

async function getHandleFromDid(did: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${did}`
    );
    if (!response.ok) return null;
    const { handle } = await response.json();
    return handle;
  } catch {
    return null;
  }
}

async function showLikesPopup(likes: LikeRecord[]): Promise<void> {
  const overlay = document.createElement("div");
  const popup = document.createElement("div");
  
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
  `;

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

  const closePopup = () => {
    overlay.remove();
    popup.remove();
  };

  overlay.onclick = closePopup;
  popup.onclick = (e) => e.stopPropagation();

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
  closeBtn.onclick = closePopup;
  popup.appendChild(closeBtn);

  const content = document.createElement("div");
  if (likes?.length) {
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
      const hasImages = !!(like.postContent?.embed?.images?.length || like.postContent?.embed?.media?.images?.length);

      post.innerHTML = `
        <div style="margin-bottom: 5px;">@${handle}</div>
        <div style="white-space: pre-wrap; margin-bottom: 10px;">${like.postContent?.text || ""}</div>
        ${hasImages ? `<div>[Post contains media]</div>` : ""}
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
  document.body.append(overlay, popup);
}

async function addLikesButton(): Promise<void> {
  if (document.querySelector("#bsky-likes-btn")) return;
  
  const feedbackLink = document.querySelector<HTMLAnchorElement>('a[href*="blueskyweb.zendesk.com"]');
  if (!feedbackLink?.parentElement) {
    setTimeout(addLikesButton, 500);
    return;
  }
  
  const link = document.createElement("div");
  link.id = "bsky-likes-btn";
  link.textContent = "Show Likes";
  link.style.cssText = `
    color: rgb(32, 139, 254);
    font-size: 14px;
    cursor: pointer;
    margin-top: 2px;
  `;

  const pathParts = window.location.pathname.split("/");
  const handle = pathParts[1] === "profile" ? pathParts[2] : null;
  
  link.onclick = (e) => {
    e.preventDefault();
    if (handle) {
      fetchLikes(handle);
    } else {
      alert("This feature only works on profile pages");
    }
  };

  feedbackLink.parentElement.appendChild(link);

  if (handle) {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${handle}`
    );

    if (response.ok) {
      const data = await response.json();
      const did = data.did;

      const tools = [
        { name: "ATP Browser", url: `https://atproto-browser.vercel.app/at/${did}` },
        { name: "PDSls", url: `https://pdsls.dev/at/${did}` },
        { name: "PLC Tracker", url: `https://pht.kpherox.dev/did/${did}` },
        { name: "Internect", url: `https://internect.info/did/${did}` },
        { name: "SkyTools", url: `https://skytools.anon5r.com/history?id=${did}` }
      ];

      const didDiv = document.createElement("div");
      didDiv.style.cssText = `
        color: rgb(32, 139, 254);
        font-size: 14px;
        margin-top: 2px;
      `;
      didDiv.textContent = `DID: ${did}`;
      feedbackLink.parentElement.appendChild(didDiv);

      tools.forEach((tool, index) => {
        if (index > 0) {
          const separator = document.createElement("span");
          separator.textContent = " · ";
          separator.style.color = "#687684";
          feedbackLink.parentElement?.appendChild(separator);
        }
        
        const toolLink = document.createElement("a");
        toolLink.href = tool.url;
        toolLink.target = "_blank";
        toolLink.textContent = tool.name;
        toolLink.style.cssText = `
          color: rgb(32, 139, 254);
          font-size: 14px;
          display: inline;
          margin-top: 2px;
          text-decoration: none;
        `;
        feedbackLink.parentElement?.appendChild(toolLink);
      });
    }
  }
}

const observer = new MutationObserver(addLikesButton);

addLikesButton();
observer.observe(document.body, {
  childList: true,
  subtree: true
});
