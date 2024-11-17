async function getDid(handle) {
  const response = await fetch(
    `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`
  );
  if (!response.ok) throw new Error("Could not resolve handle");
  const data = await response.json();
  return data.did;
}

async function getPostContent(uri) {
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

async function fetchLikes(handle) {
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

    // Fetch content for each liked post
    const postsWithContent = await Promise.all(
      data.records.map(async (like) => {
        const content = await getPostContent(like.value.subject.uri);
        return {
          ...like,
          postContent: content,
        };
      })
    );

    showLikesPopup(postsWithContent);
  } catch (error) {
    console.error("Full error:", error);
    alert("Error fetching likes: " + error.message);
  }
}

function showLikesPopup(likes) {
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
    likes.forEach((like) => {
      const post = document.createElement("div");
      post.style.cssText = `
          margin: 10px 0;
          padding: 15px;
          border-bottom: 1px solid #eee;
          background: #f9f9f9;
          border-radius: 8px;
        `;

      const postContent = like.postContent?.text || "Content not available";

      post.innerHTML = `
          <div style="margin-bottom: 10px; font-weight: bold;">Post Content:</div>
          <div style="white-space: pre-wrap; margin-bottom: 10px;">${postContent}</div>
          <div style="color: #666; font-size: 0.9em;">
            Liked at: ${new Date(like.value.createdAt).toLocaleString()}
          </div>
          <div style="color: #888; font-size: 0.8em; margin-top: 5px;">
            URI: ${like.value.subject.uri}
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

function addLikesButton() {
  const existingButton = document.querySelector("#bsky-likes-btn");
  if (existingButton) return;

  const feedbackLink = document.querySelector(
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
