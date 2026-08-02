# KomikPlus API

A manga/komik API client for .NET — part of the **Soora** project.

## Features

### Search Capabilities:

1. Browse homepage content
2. Search by keywords
3. Search by tags with optional popularity sorting
4. Filter tags using `-` prefix (exclusion)

### Book Operations:

1. Fetch book/manga details
2. Get related/recommended books

### Image Operations:

1. Page images (preview, thumbnail, and original quality)
2. Cover images (preview and thumbnail)

## Usage Examples

### Initialize Client:

```csharp
var client = new KomikPlusClient("your-user-agent-string");
```

### Search Books:

```csharp
// Search with keywords
var result = await client.GetSearchPageListAsync("one piece", 1);

// Browse homepage
var homeResults = await client.GetHomePageListAsync(1);
```

### Get Book Details:

```csharp
// Get book by ID
var book = await client.GetBookAsync(123);

// Get related books
var related = await client.GetBookRecommendAsync(123);
```

### Get Images:

```csharp
var book = await client.GetBookAsync(123);

// Get full page image
byte[] picture = await client.GetPictureAsync(book, 1);

// Get cover image
byte[] cover = await client.GetBigCoverPictureAsync(book);

// Get thumbnails
byte[] thumbnail = await client.GetThumbPictureAsync(book, 1);
byte[] coverThumb = await client.GetBookThumbPictureAsync(book);
```

## Tech Stack

- .NET 8.0
- System.Text.Json
- Async/Await throughout

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
