use crate::io::SafeSliceExt;
use std::{
    io::{Seek, SeekFrom, Write},
    time::{Duration, Instant},
};

const WINDOW: Duration = Duration::from_secs(1);

pub struct LimitedWriter<W: Write> {
    inner: W,
    bytes_per_second: u64,
    window_start: Instant,
    bytes_written_in_window: u64,
}

impl<W: Write> LimitedWriter<W> {
    pub fn new_with_bytes_per_second(inner: W, bytes_per_second: u64) -> Self {
        Self {
            inner,
            bytes_per_second,
            window_start: Instant::now(),
            bytes_written_in_window: 0,
        }
    }

    #[inline]
    pub fn into_inner(self) -> W {
        self.inner
    }
}

impl<W: Write> Write for LimitedWriter<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if crate::unlikely(buf.is_empty()) {
            return Ok(0);
        }

        if self.bytes_per_second == 0 {
            return self.inner.write(buf);
        }

        let now = Instant::now();
        if now.duration_since(self.window_start) >= WINDOW {
            self.window_start = now;
            self.bytes_written_in_window = 0;
        }

        let mut budget = self.bytes_per_second - self.bytes_written_in_window;
        if budget == 0 {
            let sleep = WINDOW.saturating_sub(now.duration_since(self.window_start));
            if !sleep.is_zero() {
                std::thread::sleep(sleep);
            }

            self.window_start = Instant::now();
            self.bytes_written_in_window = 0;
            budget = self.bytes_per_second;
        }

        let to_write = buf.len().min(budget as usize);
        let bytes_written = self.inner.write(buf.get_slice(..to_write)?)?;
        self.bytes_written_in_window += bytes_written as u64;

        Ok(bytes_written)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

impl<W: Write + Seek> Seek for LimitedWriter<W> {
    fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
        self.inner.seek(pos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // LimitedWriter

    #[test]
    fn limited_writer_clamps_write_to_window_budget() {
        let mut w = LimitedWriter::new_with_bytes_per_second(Vec::new(), 100);

        assert_eq!(w.write(&[0; 1024]).unwrap(), 100);
    }

    #[test]
    fn limited_writer_zero_limit_passes_through() {
        let mut w = LimitedWriter::new_with_bytes_per_second(Vec::new(), 0);

        assert_eq!(w.write(&[0; 1024]).unwrap(), 1024);
    }

    #[test]
    fn limited_writer_enforces_rate_over_time() {
        let mut w = LimitedWriter::new_with_bytes_per_second(Vec::new(), 100);

        // 250 bytes at 100 B/s: 100 in the first window, the rest needs 2 more windows
        let start = Instant::now();
        w.write_all(&[0; 250]).unwrap();

        assert_eq!(w.into_inner().len(), 250);
        assert!(start.elapsed() >= Duration::from_secs(2));
    }
}
