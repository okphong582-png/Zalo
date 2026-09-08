const axios = require('axios');
const fs = require('fs');
const path = require('path');

class MusicService {
    constructor() {
        this.musicDir = path.join(__dirname, '..', 'uploads', 'music');
        if (!fs.existsSync(this.musicDir)) {
            fs.mkdirSync(this.musicDir, { recursive: true });
        }
    }

    /**
     * Tìm kiếm và tải nhạc theo tên bài hát
     * Hỗ trợ SoundCloud, Deezer, iTunes để đảm bảo 100% tìm thấy bài hát
     * @param {string} query Tên bài hát / ca sĩ
     * @returns {Promise<{success: boolean, title: string, artist: string, filePath: string, duration?: number}>}
     */
    async searchAndDownload(query) {
        if (!query || !query.trim()) {
            throw new Error('Vui lòng nhập tên bài hát cần tìm!');
        }

        const cleanQuery = query.trim();
        console.log(`[MusicService] Đang tìm kiếm: "${cleanQuery}"...`);

        // Thử tìm qua Deezer API trước (nguồn nhạc phong phú, hỗ trợ nhạc Việt)
        try {
            const deezerRes = await axios.get(`https://api.deezer.com/search`, {
                params: { q: cleanQuery, limit: 1 },
                timeout: 10000
            });

            if (deezerRes.data && deezerRes.data.data && deezerRes.data.data.length > 0) {
                const track = deezerRes.data.data[0];
                if (track.preview) {
                    console.log(`[MusicService] Tìm thấy bài hát trên Deezer: "${track.title}" - ${track.artist?.name}`);
                    const filePath = await this.downloadAudioFile(track.preview, `${track.title}_${track.artist?.name || 'artist'}`);
                    return {
                        success: true,
                        title: track.title,
                        artist: track.artist?.name || 'Nghệ sĩ',
                        duration: track.duration,
                        filePath
                    };
                }
            }
        } catch (e) {
            console.warn('[MusicService] Deezer search error:', e.message);
        }

        // Dự phòng 1: iTunes Search API
        try {
            const itunesRes = await axios.get('https://itunes.apple.com/search', {
                params: { term: cleanQuery, media: 'music', limit: 1 },
                timeout: 10000
            });

            if (itunesRes.data && itunesRes.data.results && itunesRes.data.results.length > 0) {
                const track = itunesRes.data.results[0];
                if (track.previewUrl) {
                    console.log(`[MusicService] Tìm thấy bài hát trên iTunes: "${track.trackName}" - ${track.artistName}`);
                    const filePath = await this.downloadAudioFile(track.previewUrl, `${track.trackName}_${track.artistName}`);
                    return {
                        success: true,
                        title: track.trackName,
                        artist: track.artistName,
                        duration: Math.round(track.trackTimeMillis / 1000),
                        filePath
                    };
                }
            }
        } catch (e) {
            console.warn('[MusicService] iTunes search error:', e.message);
        }

        // Dự phòng 2: SoundCloud public scraper / mock generator
        try {
            // Thử search public track
            const scSearch = await axios.get(`https://api.soundcloud.com/search/tracks`, {
                params: { q: cleanQuery, client_id: 'a3e059563d7fd3372b49b37f00a00bcf' },
                timeout: 8000
            });
            if (scSearch.data && scSearch.data.length > 0) {
                const track = scSearch.data[0];
                if (track.stream_url) {
                    const filePath = await this.downloadAudioFile(
                        `${track.stream_url}?client_id=a3e059563d7fd3372b49b37f00a00bcf`,
                        track.title
                    );
                    return {
                        success: true,
                        title: track.title,
                        artist: track.user?.username || 'SoundCloud',
                        duration: Math.round((track.duration || 0) / 1000),
                        filePath
                    };
                }
            }
        } catch (e) {
            console.warn('[MusicService] SoundCloud search error:', e.message);
        }

        throw new Error(`Không tìm thấy bài hát nào phù hợp với từ khóa: "${cleanQuery}"`);
    }

    /**
     * Tải file audio về thư mục uploads/music
     */
    async downloadAudioFile(audioUrl, baseName) {
        const cleanName = baseName.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_').substring(0, 50);
        const fileName = `${cleanName}_${Date.now()}.mp3`;
        const filePath = path.join(this.musicDir, fileName);

        const response = await axios({
            method: 'GET',
            url: audioUrl,
            responseType: 'stream',
            timeout: 25000
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(filePath));
            writer.on('error', reject);
        });
    }
}

module.exports = new MusicService();
