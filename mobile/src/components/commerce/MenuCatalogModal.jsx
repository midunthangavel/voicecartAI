import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  SafeAreaView,
} from 'react-native';
import { colors } from '../../theme/colors';

export default function MenuCatalogModal({
  isOpen,
  onClose,
  catalog = [],
  onSelectItem,
  activeLanguage = 'en-IN',
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Extract unique categories
  const categories = ['All', ...new Set(catalog.map((i) => i.category_name || 'General'))];

  const filteredItems = catalog.filter((item) => {
    const matchesCategory =
      selectedCategory === 'All' || item.category_name === selectedCategory;
    const matchesSearch =
      (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.name_tamil || '').includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  return (
    <Modal visible={isOpen} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>🍽️ Restaurant Menu</Text>
            <Text style={styles.headerSub}>Sri Krishna Sweets / Annapoorna</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕ Close</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search biryani, parotta, curry, drinks..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Category Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContent}
        >
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                selectedCategory === cat && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === cat && styles.categoryTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Item List */}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {filteredItems.map((dish) => {
            const isVeg = dish.dietary_tags === 'veg';
            return (
              <View key={dish.id || dish.name} style={styles.itemCard}>
                <View style={styles.itemInfo}>
                  <View style={styles.tagRow}>
                    <View
                      style={[
                        styles.dietaryDot,
                        { borderColor: isVeg ? colors.veg : colors.nonVeg },
                      ]}
                    >
                      <View
                        style={[
                          styles.dietaryInner,
                          { backgroundColor: isVeg ? colors.veg : colors.nonVeg },
                        ]}
                      />
                    </View>
                    {dish.is_special ? (
                      <Text style={styles.specialBadge}>⭐ SPECIAL</Text>
                    ) : null}
                  </View>

                  <Text style={styles.dishName}>
                    {activeLanguage === 'ta-IN' && dish.name_tamil
                      ? dish.name_tamil
                      : dish.name}
                  </Text>
                  {activeLanguage !== 'ta-IN' && dish.name_tamil ? (
                    <Text style={styles.tamilSubtitle}>{dish.name_tamil}</Text>
                  ) : null}

                  <Text style={styles.dishPrice}>₹{dish.price}</Text>
                </View>

                <TouchableOpacity
                  style={styles.orderBtn}
                  onPress={() => {
                    if (onSelectItem) onSelectItem(dish.name, 1);
                    onClose();
                  }}
                >
                  <Text style={styles.orderBtnText}>+ Ask AI</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  categoryScroll: {
    maxHeight: 44,
    marginBottom: 8,
  },
  categoryContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryTextActive: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
  },
  itemInfo: {
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  dietaryDot: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dietaryInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  specialBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accentAmber,
  },
  dishName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tamilSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  dishPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 4,
  },
  orderBtn: {
    backgroundColor: colors.primaryGlow,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginLeft: 10,
  },
  orderBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
});
