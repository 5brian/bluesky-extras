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

async function fetchLikes(handle: string): Promise<void> {
  try {
    const did = await getDid(handle);
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=app.bsky.feed.like`
    );
    if (!response.ok)
      throw new Error(`Server responded with ${response.status}`);

    const data = await response.json();
    const postsWithContent = await Promise.all(
      data.records.map(async (like: LikeRecord) => ({
        ...like,
        postContent: await getPostContent(like.value.subject.uri),
      }))
    );

    await showLikesPopup(postsWithContent);
  } catch (error) {
    alert("Error fetching likes: " + (error as Error).message);
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
      const hasImages = !!(
        like.postContent?.embed?.images?.length ||
        like.postContent?.embed?.media?.images?.length
      );

      post.innerHTML = `
        <div style="margin-bottom: 5px;">@${handle}</div>
        <div style="white-space: pre-wrap; margin-bottom: 10px;">${
          like.postContent?.text || ""
        }</div>
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

function createMenuItem(text: string, onClick: () => void): HTMLButtonElement {
  const item = document.createElement("button");
  item.style.cssText = `
    text-align: left;
    width: 100%;
    padding: 8px 16px;
    font: inherit;
    font-size: 14px;
    border: none;
    background: none;
    cursor: pointer;
    display: block;
    border-radius: 4px;
    color: rgb(247, 247, 247);
  `;
  item.addEventListener("mouseover", () => {
    item.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
  });
  item.addEventListener("mouseout", () => {
    item.style.backgroundColor = "transparent";
  });
  item.textContent = text;
  item.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };
  return item;
}

async function addMenuItems(): Promise<void> {
  const menu = document.querySelector('div[role="menu"]');
  if (!menu || document.querySelector("#bsky-tools-menu")) {
    return;
  }

  const pathParts = window.location.pathname.split("/");
  const handle = pathParts[1] === "profile" ? pathParts[2] : null;

  if (!handle) return;

  try {
    const did = await getDid(handle);

    const menuContainer = document.createElement("div");
    menuContainer.id = "bsky-tools-menu";
    menuContainer.style.cssText = `
      background: rgb(39, 39, 42);
      border-radius: 8px;
      padding: 4px;
      margin-top: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    `;

    const showLikesItem = createMenuItem("Show Likes", () => {
      fetchLikes(handle);
      menu.remove();
    });

    const copyDidItem = createMenuItem("Copy DID", () => {
      navigator.clipboard.writeText(did);
      menu.remove();
    });

    const tools = [
      {
        name: "ATP Browser",
        url: `https://atproto-browser.vercel.app/at/${did}`,
      },
      { name: "PDSls", url: `https://pdsls.dev/at/${did}` },
      { name: "Internect", url: `https://internect.info/did/${did}` },
      { name: "PLC Tracker", url: `https://pht.kpherox.dev/did/${did}` },
      {
        name: "SkyTools",
        url: `https://skytools.anon5r.com/history?id=${did}`,
      },
    ];

    menuContainer.appendChild(showLikesItem);
    menuContainer.appendChild(copyDidItem);

    tools.forEach((tool) => {
      const button = createMenuItem(tool.name, () => {
        window.open(tool.url, "_blank");
        menu.remove();
      });
      menuContainer.appendChild(button);
    });

    menu.appendChild(menuContainer);
  } catch (error) {
    console.error("Error adding menu items:", error);
  }
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    const nodes = Array.from(mutation.addedNodes);
    for (const node of nodes) {
      if (node instanceof HTMLElement) {
        if (
          node.getAttribute("role") === "menu" ||
          node.querySelector('div[role="menu"]')
        ) {
          setTimeout(addMenuItems, 0);
        }
      }
    }
  }
});

observer.observe(document, {
  childList: true,
  subtree: true,
});
