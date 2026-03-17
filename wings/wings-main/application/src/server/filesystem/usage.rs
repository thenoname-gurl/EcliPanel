use compact_str::ToCompactString;
use std::{fmt::Debug, iter::Peekable, path::Path};

#[derive(Debug, Default, Clone, Copy)]
pub struct UsedSpace {
    logical: u64,
    physical: u64,
}

impl UsedSpace {
    #[inline]
    pub fn new(logical: u64, physical: u64) -> Self {
        Self { logical, physical }
    }

    #[inline]
    pub fn get_logical(&self) -> u64 {
        self.logical
    }

    #[inline]
    pub fn set_logical(&mut self, val: u64) {
        self.logical = val;
    }

    #[inline]
    pub fn sub_logical(&mut self, val: u64) {
        let logical = self.get_logical();
        self.set_logical(logical.saturating_sub(val));
    }

    #[inline]
    pub fn add_logical(&mut self, val: u64) {
        let logical = self.get_logical();
        self.set_logical(logical.saturating_add(val));
    }

    #[inline]
    pub fn get_physical(&self) -> u64 {
        self.physical
    }

    #[inline]
    pub fn set_physical(&mut self, val: u64) {
        self.physical = val;
    }

    #[inline]
    pub fn sub_physical(&mut self, val: u64) {
        let physical = self.get_physical();
        self.set_physical(physical.saturating_sub(val));
    }

    #[inline]
    pub fn add_physical(&mut self, val: u64) {
        let physical = self.get_physical();
        self.set_physical(physical.saturating_add(val));
    }
}

impl std::ops::Add for UsedSpace {
    type Output = Self;

    #[inline]
    fn add(self, rhs: Self) -> Self::Output {
        Self {
            logical: self.logical.saturating_add(rhs.logical),
            physical: self.physical.saturating_add(rhs.physical),
        }
    }
}

impl std::iter::Sum for UsedSpace {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.fold(Self::default(), |acc, x| acc + x)
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SpaceDelta {
    pub logical: i64,
    pub physical: i64,
}

impl SpaceDelta {
    #[inline]
    pub fn new(logical: i64, physical: i64) -> Self {
        Self { logical, physical }
    }

    #[inline]
    pub fn zero() -> Self {
        Self {
            logical: 0,
            physical: 0,
        }
    }

    #[inline]
    pub fn only_logical(logical: i64) -> Self {
        Self {
            logical,
            physical: 0,
        }
    }

    #[inline]
    pub fn only_physical(physical: i64) -> Self {
        Self {
            logical: 0,
            physical,
        }
    }
}

impl From<i64> for SpaceDelta {
    #[inline]
    fn from(value: i64) -> Self {
        SpaceDelta {
            logical: value,
            physical: value,
        }
    }
}

#[derive(Debug, Default)]
pub struct DiskUsage {
    pub space: UsedSpace,
    entries: thin_vec::ThinVec<(compact_str::CompactString, DiskUsage)>,
}

impl DiskUsage {
    fn upsert_entry(&mut self, key: &str) -> &mut DiskUsage {
        match self.entries.binary_search_by(|a| a.0.as_str().cmp(key)) {
            Ok(idx) => &mut self.entries[idx].1,
            Err(idx) => {
                self.entries
                    .insert(idx, (key.to_compact_string(), DiskUsage::default()));
                &mut self.entries[idx].1
            }
        }
    }

    fn get_entry(&mut self, key: &str) -> Option<&mut DiskUsage> {
        if let Ok(idx) = self.entries.binary_search_by(|a| a.0.as_str().cmp(key)) {
            Some(&mut self.entries[idx].1)
        } else {
            None
        }
    }

    fn remove_entry(&mut self, key: &str) -> Option<DiskUsage> {
        if let Ok(idx) = self.entries.binary_search_by(|a| a.0.as_str().cmp(key)) {
            Some(self.entries.remove(idx).1)
        } else {
            None
        }
    }

    #[inline]
    pub fn get_entries(&self) -> &[(compact_str::CompactString, DiskUsage)] {
        &self.entries
    }

    pub fn get_size(&self, path: &Path) -> Option<UsedSpace> {
        if crate::unlikely(path == Path::new("") || path == Path::new("/")) {
            return Some(self.space);
        }

        let mut current = self;
        for component in path.components() {
            let name = component.as_os_str().to_str()?;
            let idx = current
                .entries
                .binary_search_by(|(n, _)| n.as_str().cmp(name))
                .ok()?;
            current = &current.entries[idx].1;
        }

        Some(current.space)
    }

    pub fn update_size(&mut self, path: &Path, delta: SpaceDelta) {
        if delta.logical >= 0 {
            self.space.add_logical(delta.logical as u64);
        } else {
            self.space.sub_logical(delta.logical.unsigned_abs());
        }
        if delta.physical >= 0 {
            self.space.add_physical(delta.physical as u64);
        } else {
            self.space.sub_physical(delta.physical.unsigned_abs());
        }

        if crate::unlikely(path == Path::new("") || path == Path::new("/")) {
            return;
        }

        let mut current = self;
        for component in path.components() {
            let key = component.as_os_str().to_str().unwrap_or_default();
            let entry = current.upsert_entry(key);

            if delta.logical >= 0 {
                entry.space.add_logical(delta.logical as u64);
            } else {
                entry.space.sub_logical(delta.logical.unsigned_abs());
            }
            if delta.physical >= 0 {
                entry.space.add_physical(delta.physical as u64);
            } else {
                entry.space.sub_physical(delta.physical.unsigned_abs());
            }

            current = entry;
        }
    }

    #[tracing::instrument(skip(self))]
    pub fn update_size_iterator(
        &mut self,
        path: impl IntoIterator<Item = impl AsRef<str> + Debug> + Debug,
        delta: SpaceDelta,
    ) {
        if delta.logical >= 0 {
            self.space.add_logical(delta.logical as u64);
        } else {
            self.space.sub_logical(delta.logical.unsigned_abs());
        }
        if delta.physical >= 0 {
            self.space.add_physical(delta.physical as u64);
        } else {
            self.space.sub_physical(delta.physical.unsigned_abs());
        }

        let mut current = self;
        for component in path {
            let entry = current.upsert_entry(component.as_ref());

            tracing::debug!(?component, "applying path delta");

            if delta.logical >= 0 {
                entry.space.add_logical(delta.logical as u64);
            } else {
                entry.space.sub_logical(delta.logical.unsigned_abs());
            }
            if delta.physical >= 0 {
                entry.space.add_physical(delta.physical as u64);
            } else {
                entry.space.sub_physical(delta.physical.unsigned_abs());
            }

            current = entry;
        }
    }

    #[tracing::instrument(skip(self))]
    pub fn remove_path(&mut self, path: &Path) -> Option<DiskUsage> {
        if crate::unlikely(path == Path::new("") || path == Path::new("/")) {
            return None;
        }

        self.recursive_remove(&mut path.components().peekable())
    }

    fn recursive_remove<'a>(
        &mut self,
        components: &mut Peekable<impl Iterator<Item = std::path::Component<'a>>>,
    ) -> Option<DiskUsage> {
        let component = components.next()?;
        let name = component.as_os_str().to_str().unwrap_or_default();

        tracing::debug!(?component, "applying path delta");

        if components.peek().is_none() {
            let removed = self.remove_entry(name)?;

            self.space.sub_logical(removed.space.get_logical());
            self.space.sub_physical(removed.space.get_physical());

            return Some(removed);
        }

        if let Some(child) = self.get_entry(name)
            && let Some(removed) = child.recursive_remove(components)
        {
            self.space.sub_logical(removed.space.get_logical());
            self.space.sub_physical(removed.space.get_physical());
            return Some(removed);
        }

        None
    }

    #[inline]
    pub fn clear(&mut self) {
        self.entries.clear();
    }

    #[tracing::instrument(skip(self, source_dir))]
    pub fn add_directory(
        &mut self,
        target_path: &[impl AsRef<str> + Debug],
        source_dir: DiskUsage,
    ) -> bool {
        if crate::unlikely(target_path.is_empty()) {
            return false;
        }

        let Some((leaf, parents)) = target_path.split_last() else {
            return false;
        };

        let mut current = self;
        for component in parents {
            tracing::debug!(?component, "applying path delta");

            current.space.add_logical(source_dir.space.get_logical());
            current.space.add_physical(source_dir.space.get_physical());

            current = current.upsert_entry(component.as_ref());
        }

        current.space.add_logical(source_dir.space.get_logical());
        current.space.add_physical(source_dir.space.get_physical());
        *current.upsert_entry(leaf.as_ref()) = source_dir;

        true
    }
}
